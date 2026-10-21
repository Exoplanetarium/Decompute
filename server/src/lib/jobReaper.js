import { pool, query } from "../db.js";
import { getUserAccountId, getPlatformAccountId, postTransaction } from "./ledger.js";
import { matchAndCreateJob } from "./jobMatching.js";
import { getWorkload } from "./workloadCatalog.js";
import { incidentModeEnabled } from "./incidentMode.js";
import { refreshNodeReliability } from "./jobSettlement.js";
import { finishChunk, settleScreenIfComplete, MAX_CHUNK_ATTEMPTS } from "./dockingScreen.js";

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
  if (incidentModeEnabled()) return; // freeze ledger movement during containment
  const { rows: candidates } = await query(`
    SELECT j.id FROM jobs j
    LEFT JOIN nodes n ON n.id = j.node_id
    WHERE
      -- A batch parent (jobBatch.js) is the one job row that never has a node
      -- and never gets claimed: it holds no money and its real status is
      -- derived from its children on read. Without this guard the sweep below
      -- force-failed every batch parent three minutes in, while its children
      -- were still running perfectly. A parent left with no children at all
      -- (its createBatchJob run died before matching any) is still swept up,
      -- so an interrupted batch can't strand a row at pending forever.
      NOT (j.node_id IS NULL AND EXISTS (SELECT 1 FROM jobs c WHERE c.parent_job_id = j.id))
      -- Docking chunks wait in a queue by design and hold no money; they
      -- have their own rules in reapDockingChunks below.
      AND j.unit_count IS NULL
      AND (
      (j.status = 'pending' AND j.created_at < now() - interval '${PENDING_CLAIM_GRACE}')
      OR (j.status = 'running' AND (
            n.last_seen_at IS NULL OR n.last_seen_at < now() - interval '${NODE_OFFLINE_GRACE}'
            -- make_interval's hours param is an int; max_runtime_hours can be
            -- fractional (e.g. 0.25 for a short template), so go through
            -- seconds instead or that gets silently truncated to 0.
            OR now() > j.started_at + make_interval(secs => j.max_runtime_hours * 3600) + interval '${RUNTIME_OVERRUN_GRACE}'
          )))
  `);

  for (const { id } of candidates) {
    try {
      await reapOne(id);
    } catch (err) {
      console.error(`Job reaper: failed to reap job ${id}:`, err.message);
    }
  }
  await reapDockingChunks();
}

// A chunk handed to a computer that never started it, or one whose computer
// went dark or overran, goes back into the queue for someone else. A queued
// chunk whose library file is gone can never run, so it fails for good
// rather than being handed out. Waiting in the queue is otherwise never a
// reason to give up: with no computers online, a screen simply waits.
// Finally, any screen left complete but unsettled is settled, which covers
// screens whose last chunk finished during incident mode.
async function reapDockingChunks() {
  const { rows: chunks } = await query(`
    SELECT j.id FROM jobs j LEFT JOIN nodes n ON n.id = j.node_id
    WHERE j.unit_count IS NOT NULL AND (
      (j.status = 'pending' AND j.node_id IS NOT NULL AND j.assigned_at < now() - interval '${PENDING_CLAIM_GRACE}')
      OR (j.status = 'pending' AND j.node_id IS NULL AND NOT EXISTS (SELECT 1 FROM job_inputs i WHERE i.job_id = j.id))
      OR (j.status = 'running' AND (
            n.last_seen_at IS NULL OR n.last_seen_at < now() - interval '${NODE_OFFLINE_GRACE}'
            OR now() > j.started_at + make_interval(secs => j.max_runtime_hours * 3600) + interval '${RUNTIME_OVERRUN_GRACE}'
          )))`);
  for (const { id } of chunks) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: [chunk] } = await client.query(
        `SELECT * FROM jobs WHERE id = $1 AND status IN ('pending','running') FOR UPDATE SKIP LOCKED`, [id]
      );
      if (chunk) {
        const abandoned = chunk.status === "pending" && chunk.node_id === null;
        const reason = abandoned ? "This chunk's molecule file is no longer available."
          : chunk.status === "pending" ? "The computer it was handed to never started it."
          : "The computer running it stopped responding.";
        await finishChunk(client, abandoned ? { ...chunk, retry_count: MAX_CHUNK_ATTEMPTS } : chunk, "failed", reason);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`Job reaper: failed to reap docking chunk ${id}:`, err.message);
    } finally {
      client.release();
    }
  }

  const { rows: screens } = await query(`
    SELECT s.id FROM jobs s
    WHERE s.price_per_unit_usd IS NOT NULL AND s.settlement_state = 'held'
      AND NOT EXISTS (SELECT 1 FROM jobs c WHERE c.parent_job_id = s.id AND c.status IN ('pending','running'))`);
  for (const { id } of screens) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await settleScreenIfComplete(client, id);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`Job reaper: failed to settle docking screen ${id}:`, err.message);
    } finally {
      client.release();
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
         billed_subtotal_usd = 0, billed_fee_usd = 0, billed_total_usd = 0, failure_reason = $2,
         settlement_state = 'refunded'
       WHERE id = $3`,
      [settlementTxnId, reason, job.id]
    );

    let retryJobId = null;
    await refreshNodeReliability(client, job.node_id);
    if (job.retry_count < MAX_AUTO_RETRIES) {
      const { rows: urows } = await client.query(
        `SELECT auto_retry_failed_jobs FROM users WHERE id = $1`, [job.user_id]
      );
      if (urows[0]?.auto_retry_failed_jobs) {
        const workload = getWorkload(job.workload_id);
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
            modelId: job.model_id,
            resultSchema: job.result_schema,
            gpuVendors: workload?.gpuVendors || [],
            seed: job.deterministic_seed,
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
