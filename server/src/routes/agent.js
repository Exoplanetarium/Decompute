import express, { Router } from "express";
import crypto from "node:crypto";
import { pool, query } from "../db.js";
import { requireAgentAuth } from "../middleware/requireAgentAuth.js";
import { getUserAccountId, getPlatformAccountId, postTransaction } from "../lib/ledger.js";

export const agentRouter = Router();

const SERVICE_FEE_RATE = 0.10;

function signedAgentJob(row, nodeId, agentToken) {
  const payload = JSON.stringify({
    id: row.id,
    nodeId,
    workloadId: row.workload_id,
    dockerImage: row.docker_image,
    gpusNeeded: row.gpus_needed,
    envVars: row.env_vars,
    maxRuntimeHours: Number(row.max_runtime_hours),
    startedAt: row.started_at,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  const manifest = Buffer.from(payload).toString("base64url");
  const signature = crypto.createHmac("sha256", agentToken).update(manifest).digest("base64url");
  return { manifest, signature };
}

// Combined liveness ping + "what should I be doing" — one poll loop covers
// both, rather than a resident agent needing two independent intervals for
// what is conceptually one question. Called every ~15s by the agent.
agentRouter.post("/heartbeat", requireAgentAuth, async (req, res) => {
  await query(`UPDATE nodes SET last_seen_at = now() WHERE id = $1`, [req.nodeId]);

  const { rows } = await query(
    `SELECT * FROM jobs WHERE node_id = $1 AND status IN ('pending','running') ORDER BY created_at ASC LIMIT 1`,
    [req.nodeId]
  );
  res.json({ data: { job: rows[0] ? signedAgentJob(rows[0], req.nodeId, req.agentToken) : null } });
});

// Transitions pending -> running. 409 if another poll already claimed it,
// the job doesn't belong to this node, or it's not in a claimable state.
agentRouter.post("/job/:id/claim", requireAgentAuth, async (req, res) => {
  const { rows } = await query(
    `UPDATE jobs SET status = 'running', started_at = now()
     WHERE id = $1 AND node_id = $2 AND status = 'pending'
     RETURNING id, started_at`,
    [req.params.id, req.nodeId]
  );
  if (!rows[0]) return res.status(409).json({ error: "Job is not claimable" });
  res.json({ data: { id: rows[0].id, startedAt: rows[0].started_at } });
});

// job_heartbeats/job_logs have no owner column of their own — every write
// below re-checks node_id and status='running' so a stale or misdirected
// agent can't write into a job it doesn't currently hold.
async function ownsRunningJob(jobId, nodeId) {
  const { rows } = await query(
    `SELECT 1 FROM jobs WHERE id = $1 AND node_id = $2 AND status = 'running'`,
    [jobId, nodeId]
  );
  return !!rows[0];
}

agentRouter.post("/job/:id/heartbeats", requireAgentAuth, async (req, res) => {
  if (!(await ownsRunningJob(req.params.id, req.nodeId))) return res.status(409).json({ error: "Job is not running on this node" });

  const samples = Array.isArray(req.body?.samples) ? req.body.samples.slice(0, 100) : [];
  for (const s of samples) {
    const gpu = Number(s?.gpuUsagePct);
    const vram = Number(s?.vramUsedGb);
    await query(
      `INSERT INTO job_heartbeats (job_id, gpu_usage_pct, vram_used_gb) VALUES ($1, $2, $3)`,
      [req.params.id, Number.isFinite(gpu) ? gpu : null, Number.isFinite(vram) ? vram : null]
    );
  }
  res.json({ ok: true });
});

const ARTIFACT_MAX_BYTES = 15 * 1024 * 1024;
const ARTIFACT_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp"];

// The agent uploads a job's output file (read off the container's mounted
// output directory) after the run finishes but before /complete — the job
// is still 'running' at that point, so this reuses the same ownership
// guard as heartbeats/logs. Raw bytes, not JSON: express.raw() below caps
// the body at ARTIFACT_MAX_BYTES so an oversized file 413s instead of
// filling memory.
agentRouter.post("/job/:id/artifact", requireAgentAuth, express.raw({ type: "*/*", limit: ARTIFACT_MAX_BYTES }), async (req, res) => {
  if (!(await ownsRunningJob(req.params.id, req.nodeId))) return res.status(409).json({ error: "Job is not running on this node" });

  const contentType = ARTIFACT_CONTENT_TYPES.includes(req.headers["content-type"]) ? req.headers["content-type"] : "application/octet-stream";
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: "Empty artifact body" });

  await query(`INSERT INTO job_artifacts (job_id, content_type, data) VALUES ($1, $2, $3)`, [req.params.id, contentType, req.body]);
  res.json({ ok: true });
});

const LOG_LEVELS = ["INFO", "WARN", "ERROR", "DEBUG"];

agentRouter.post("/job/:id/logs", requireAgentAuth, async (req, res) => {
  if (!(await ownsRunningJob(req.params.id, req.nodeId))) return res.status(409).json({ error: "Job is not running on this node" });

  const lines = Array.isArray(req.body?.lines) ? req.body.lines.slice(0, 200) : [];
  for (const l of lines) {
    const level = LOG_LEVELS.includes(l?.level) ? l.level : "INFO";
    const msg = String(l?.msg || "").slice(0, 4000);
    if (!msg) continue;
    await query(`INSERT INTO job_logs (job_id, level, msg) VALUES ($1, $2, $3)`, [req.params.id, level, msg]);
  }
  res.json({ ok: true });
});

// Settles the job. Failed jobs are fully refunded — no payout for
// incomplete work. Completed jobs bill for actual elapsed time (capped at
// what was paid for), refund the unused portion, and release the billed
// amount split between the node owner and platform_revenue. Two
// postTransaction calls, not one: userBalanceDelta only updates one user's
// cached balance per call, and the refund (renter) and release (node
// owner) are two different users.
agentRouter.post("/job/:id/complete", requireAgentAuth, async (req, res) => {
  const status = req.body?.status === "failed" ? "failed" : "done";
  const errorMessage = req.body?.errorMessage ? String(req.body.errorMessage).slice(0, 4000) : null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const jobRes = await client.query(
      `SELECT * FROM jobs WHERE id = $1 AND node_id = $2 AND status = 'running' FOR UPDATE`,
      [req.params.id, req.nodeId]
    );
    const job = jobRes.rows[0];
    if (!job) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Job is not running on this node" });
    }

    if (errorMessage) {
      await client.query(`INSERT INTO job_logs (job_id, level, msg) VALUES ($1, 'ERROR', $2)`, [job.id, errorMessage]);
    }

    const total = Number(job.total_usd);
    const renterAccountId = await getUserAccountId(client, job.user_id);
    const platformEscrowId = await getPlatformAccountId(client, "platform_escrow");
    let settlementTxnId;
    // Failed jobs are fully refunded — nothing billed. Overwritten below
    // for a successful completion, where these become the real, prorated
    // amount actually kept (as opposed to total_usd, the original escrow
    // hold for the job's full max_runtime_hours).
    let billedSubtotal = 0, billedFee = 0, billedTotal = 0;

    if (status === "failed") {
      settlementTxnId = await postTransaction(client, {
        type: "job_refund",
        referenceType: "job",
        referenceId: job.id,
        lines: [
          { accountId: platformEscrowId, amount: total },
          { accountId: renterAccountId, amount: -total },
        ],
        userBalanceDelta: { userId: job.user_id, amount: total },
      });
    } else {
      const elapsedHours = Math.max(0, (Date.now() - new Date(job.started_at).getTime()) / 3_600_000);
      const billedHours = Math.min(Number(job.max_runtime_hours), elapsedHours);
      billedSubtotal = Math.round(Number(job.price_per_hour) * billedHours * 100) / 100;
      billedFee = Math.round(billedSubtotal * SERVICE_FEE_RATE * 100) / 100;
      billedTotal = Math.round((billedSubtotal + billedFee) * 100) / 100;
      const unusedRefund = Math.round((total - billedTotal) * 100) / 100;

      if (unusedRefund > 0) {
        await postTransaction(client, {
          type: "job_refund",
          referenceType: "job",
          referenceId: job.id,
          lines: [
            { accountId: platformEscrowId, amount: unusedRefund },
            { accountId: renterAccountId, amount: -unusedRefund },
          ],
          userBalanceDelta: { userId: job.user_id, amount: unusedRefund },
        });
      }

      // owner_id can only be null for the pre-agent seed catalog, which
      // can never actually reach a running job (no agent_token_hash means
      // no liveness heartbeat, so it can never be matched) — defensive,
      // not an expected path.
      const nodeRes = await client.query(`SELECT owner_id FROM nodes WHERE id = $1`, [job.node_id]);
      const ownerId = nodeRes.rows[0]?.owner_id;
      const platformRevenueId = await getPlatformAccountId(client, "platform_revenue");

      if (ownerId) {
        const ownerAccountId = await getUserAccountId(client, ownerId);
        settlementTxnId = await postTransaction(client, {
          type: "job_escrow_release",
          referenceType: "job",
          referenceId: job.id,
          lines: [
            { accountId: platformEscrowId, amount: billedTotal },
            { accountId: ownerAccountId, amount: -billedSubtotal },
            { accountId: platformRevenueId, amount: -billedFee },
          ],
          userBalanceDelta: { userId: ownerId, amount: billedSubtotal },
        });
      } else {
        settlementTxnId = await postTransaction(client, {
          type: "job_escrow_release",
          referenceType: "job",
          referenceId: job.id,
          lines: [
            { accountId: platformEscrowId, amount: billedTotal },
            { accountId: platformRevenueId, amount: -billedTotal },
          ],
        });
      }
    }

    await client.query(
      `UPDATE jobs SET status = $1, completed_at = now(), settlement_transaction_id = $2,
         billed_subtotal_usd = $3, billed_fee_usd = $4, billed_total_usd = $5 WHERE id = $6`,
      [status, settlementTxnId, billedSubtotal.toFixed(2), billedFee.toFixed(2), billedTotal.toFixed(2), job.id]
    );

    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});
