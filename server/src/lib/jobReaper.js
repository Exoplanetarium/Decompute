import { pool, query } from "../db.js";
import { getUserAccountId, getPlatformAccountId, postTransaction } from "./ledger.js";
import { matchAndCreateJob } from "./jobMatching.js";

// No queue/worker process runs job matching in this codebase (see the
// comment on POST /api/jobs) — matching happens synchronously when a renter
// asks for it. But that leaves one gap: a job whose node goes dark mid-run
// (agent crash, network drop) never gets a synchronous moment to notice.
// This sweep is the fix — a plain interval inside the existing API process,
// not a separate service, run every REAP_INTERVAL_MS from index.js.
const PENDING_CLAIM_GRACE = "3 minutes";   // matched to a node that never polled/claimed it
const NODE_OFFLINE_GRACE = "5 minutes";    // node's own heartbeat has gone stale mid-run
const RUNTIME_OVERRUN_GRACE = "10 minutes"; // past its own max_runtime_hours + buffer, node heartbeat or not
const MAX_AUTO_RETRIES = 2;

export async function reapStuckJobs() {
  const { rows: candidates } = await query(`
    SELECT j.id FROM jobs j
    LEFT JOIN nodes n ON n.id = j.node_id
    WHERE
      (j.status = 'pending' AND j.created_at < now() - interval '${PENDING_CLAIM_GRACE}')
      OR (j.status = 'running' AND (
            n.last_seen_at IS NULL OR n.last_seen_at < now() - interval '${NODE_OFFLINE_GRACE}'
            -- make_interval's hours param is an int; max_runtime_hours can be
            -- fractional (e.g. 0.25 for a short template), so go through
            -- seconds instead or that gets silently truncated to 0.
            OR now() > j.started_at + make_interval(secs => j.max_runtime_hours * 3600) + interval '${RUNTIME_OVERRUN_GRACE}'
          ))
  `);

  for (const { id } of candidates) {
    try {
      await reapOne(id);
    } catch (err) {
      console.error(`Job reaper: failed to reap job ${id}:`, err.message);
    }
  }
}

async function reapOne(jobId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Re-check under lock — the candidate scan above ran without one, so
    // another reaper tick (or the job legitimately completing) may have
    // already resolved this since. SKIP LOCKED means a concurrent tick just
    // moves on instead of blocking on the same row.
    const { rows } = await client.query(
      `SELECT j.*, n.last_seen_at FROM jobs j LEFT JOIN nodes n ON n.id = j.node_id
       WHERE j.id = $1 AND j.status IN ('pending','running') FOR UPDATE OF j SKIP LOCKED`,
      [jobId]
    );
    const job = rows[0];
    if (!job) { await client.query("ROLLBACK"); return; }

    const stuckPending = job.status === "pending"
      && new Date(job.created_at) < new Date(Date.now() - 3 * 60_000);
    const stuckRunning = job.status === "running" && (
      !job.last_seen_at
      || new Date(job.last_seen_at) < new Date(Date.now() - 5 * 60_000)
      || Date.now() > new Date(job.started_at).getTime() + Number(job.max_runtime_hours) * 3_600_000 + 10 * 60_000
    );
    if (!stuckPending && !stuckRunning) { await client.query("ROLLBACK"); return; }

    // Full refund — same job_refund shape agent.js already uses for a
    // reported failure. "Your money is unchanged" means the renter keeps
    // exactly what they had before this job, not a partial/prorated amount.
    const total = Number(job.total_usd);
    const renterAccountId = await getUserAccountId(client, job.user_id);
    const platformEscrowId = await getPlatformAccountId(client, "platform_escrow");
    const reason = stuckPending
      ? "No node claimed this job in time — it may have gone offline right after matching."
      : "The node running this job stopped responding.";

    const settlementTxnId = await postTransaction(client, {
      type: "job_refund",
      referenceType: "job",
      referenceId: job.id,
      lines: [
        { accountId: platformEscrowId, amount: total },
        { accountId: renterAccountId, amount: -total },
      ],
      userBalanceDelta: { userId: job.user_id, amount: total },
    });

    await client.query(
      `UPDATE jobs SET status = 'failed', completed_at = now(), settlement_transaction_id = $1,
         billed_subtotal_usd = 0, billed_fee_usd = 0, billed_total_usd = 0, failure_reason = $2
       WHERE id = $3`,
      [settlementTxnId, reason, job.id]
    );

    let retryJobId = null;
    if (job.retry_count < MAX_AUTO_RETRIES) {
      const { rows: urows } = await client.query(
        `SELECT auto_retry_failed_jobs FROM users WHERE id = $1`, [job.user_id]
      );
      if (urows[0]?.auto_retry_failed_jobs) {
        // Isolated in a savepoint: if no other node is available right now,
        // that failure must not undo the refund above — it just means this
        // job is left for the renter to retry manually instead.
        await client.query("SAVEPOINT retry_attempt");
        try {
          const { job: retryJob } = await matchAndCreateJob(client, {
            userId: job.user_id,
            nodeId: null, // don't re-target the node that just went dark
            workloadId: job.workload_id, dockerImage: job.docker_image,
            gpusNeeded: job.gpus_needed,
            minVramGb: job.min_vram_gb,
            maxRuntimeHours: Number(job.max_runtime_hours),
            name: job.name,
            envVars: job.env_vars,
            retryOfJobId: job.id,
            retryCount: job.retry_count + 1,
          });
          retryJobId = retryJob.id;
        } catch {
          await client.query("ROLLBACK TO SAVEPOINT retry_attempt");
        }
      }
    }

    await client.query("COMMIT");
    console.log(`Job reaper: reaped job ${job.id} (${reason})${retryJobId ? ` — auto-retried as ${retryJobId}` : ""}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
