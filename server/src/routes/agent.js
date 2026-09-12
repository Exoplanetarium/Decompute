import express, { Router } from "express";
import { pool, query } from "../db.js";
import { requireAgentAuth } from "../middleware/requireAgentAuth.js";
import { getWorkload } from "../lib/workloadCatalog.js";
import { signJobManifest } from "../lib/jobManifest.js";
import { validateArtifact } from "../lib/resultValidation.js";
import { incidentModeEnabled } from "../lib/incidentMode.js";
import { settleJob } from "../lib/jobSettlement.js";

export const agentRouter = Router();

const BENCHMARK_BYTES = 256 * 1024;
const benchmarkPayload = Buffer.alloc(BENCHMARK_BYTES, 0x5a);
agentRouter.get("/benchmark", requireAgentAuth, (req, res) => {
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Cache-Control", "no-store");
  res.send(benchmarkPayload);
});
agentRouter.post("/benchmark", requireAgentAuth, express.raw({ type: "application/octet-stream", limit: BENCHMARK_BYTES }), (req, res) => {
  if (!Buffer.isBuffer(req.body) || req.body.length !== BENCHMARK_BYTES) return res.status(400).json({ error: "Invalid benchmark payload" });
  res.json({ ok: true });
});

// Combined liveness ping + "what should I be doing" — one poll loop covers
// both, rather than a resident agent needing two independent intervals for
// what is conceptually one question. Called every ~15s by the agent.
agentRouter.post("/heartbeat", requireAgentAuth, async (req, res) => {
  const cachedModels = Array.isArray(req.body?.capabilities?.cachedModels)
    ? [...new Set(req.body.capabilities.cachedModels.map(String).filter((v) => v.length <= 300))].slice(0, 100)
    : [];
  const benchmark = req.body?.capabilities?.benchmark || {};
  const numberOrNull = (value, max) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
  };
  await query(`UPDATE nodes SET last_seen_at = now(), cached_models = $2,
      gpu_benchmark_score = COALESCE($3, gpu_benchmark_score),
      network_download_mbps = COALESCE($4, network_download_mbps),
      network_upload_mbps = COALESCE($5, network_upload_mbps),
      benchmark_version = COALESCE($6, benchmark_version), capabilities_reported_at = now()
    WHERE id = $1`, [req.nodeId, JSON.stringify(cachedModels),
      numberOrNull(benchmark.gpuScore, 1e12), numberOrNull(benchmark.downloadMbps, 1e7),
      numberOrNull(benchmark.uploadMbps, 1e7), benchmark.version ? String(benchmark.version).slice(0, 50) : null]);

  const { rows } = await query(
    `SELECT * FROM jobs WHERE node_id = $1 AND status IN ('pending','running') ORDER BY created_at ASC LIMIT 1`,
    [req.nodeId]
  );
  if (!rows[0]) return res.json({ data: { job: null, incidentMode: incidentModeEnabled() } });
  const job = rows[0];
  const inputs = (await query(
    `SELECT id::text, filename, content_type, sha256, byte_size FROM job_inputs WHERE job_id = $1 ORDER BY id`, [job.id]
  )).rows;
  const workload = getWorkload(job.workload_id);
  if (!workload) return res.status(409).json({ error: "Assigned workload is no longer enabled" });
  const signed = signJobManifest(job, req.nodeId, req.agentToken, inputs, workload);
  await query(`UPDATE jobs SET manifest_hash = $1 WHERE id = $2 AND manifest_hash IS NULL`, [signed.manifestHash, job.id]);
  res.json({ data: { job: { manifest: signed.manifest, signature: signed.signature }, incidentMode: incidentModeEnabled() } });
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

agentRouter.get("/job/:id/input/:inputId", requireAgentAuth, async (req, res) => {
  const { rows } = await query(
    `SELECT i.filename, i.content_type, i.sha256, i.data FROM job_inputs i
     JOIN jobs j ON j.id = i.job_id
     WHERE i.id = $1 AND j.id = $2 AND j.node_id = $3 AND j.status IN ('pending','running')`,
    [req.params.inputId, req.params.id, req.nodeId]
  );
  if (!rows[0]) return res.status(404).json({ error: "Input not found" });
  res.setHeader("Content-Type", rows[0].content_type);
  res.setHeader("X-Decompute-Sha256", rows[0].sha256);
  res.setHeader("Content-Disposition", `attachment; filename="${rows[0].filename.replace(/["\\]/g, "_")}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(rows[0].data);
});

// The agent uploads a job's output file (read off the container's mounted
// output directory) after the run finishes but before /complete — the job
// is still 'running' at that point, so this reuses the same ownership
// guard as heartbeats/logs. Raw bytes, not JSON: express.raw() below caps
// the body at ARTIFACT_MAX_BYTES so an oversized file 413s instead of
// filling memory.
agentRouter.post("/job/:id/artifact", requireAgentAuth, express.raw({ type: "*/*", limit: ARTIFACT_MAX_BYTES }), async (req, res) => {
  if (!(await ownsRunningJob(req.params.id, req.nodeId))) return res.status(409).json({ error: "Job is not running on this node" });

  const job = (await query(`SELECT workload_id, result_schema FROM jobs WHERE id = $1`, [req.params.id])).rows[0];
  const workload = getWorkload(job.workload_id);
  const contentType = String(req.headers["x-decompute-result-content-type"] || req.headers["content-type"] || "application/octet-stream").split(";")[0];
  try {
    const result = validateArtifact({ schema: job.result_schema, contentType, data: req.body,
      claimedHash: String(req.headers["x-decompute-sha256"] || ""),
      allowedContentTypes: workload?.allowedContentTypes || [] });
    await query(`INSERT INTO job_artifacts
      (job_id, content_type, data, sha256, byte_size, validated, validation_metadata)
      VALUES ($1,$2,$3,$4,$5,true,$6)`,
      [req.params.id, contentType, req.body, result.sha256, result.byteSize, JSON.stringify(result.metadata)]);
    await query(`UPDATE jobs SET result_validated = true, result_hash = $1, result_metadata = $2 WHERE id = $3`,
      [result.sha256, JSON.stringify(result.metadata), req.params.id]);
    res.json({ ok: true, data: result });
  } catch (err) {
    res.status(422).json({ error: err.message });
  }
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

    if (status === "done" && job.result_schema && !job.result_validated) {
      await client.query("ROLLBACK");
      return res.status(422).json({ error: "A validated result artifact is required before successful completion" });
    }

    if (errorMessage) {
      await client.query(`INSERT INTO job_logs (job_id, level, msg) VALUES ($1, 'ERROR', $2)`, [job.id, errorMessage]);
    }

    if (incidentModeEnabled()) {
      // Record the outcome but make no ledger movement. The immutable escrow
      // hold remains balanced in the database until the reconciliation sweep
      // runs after incident mode is removed.
      await client.query(
        `UPDATE jobs SET status = $1, completed_at = now(), failure_reason = $2,
           settlement_state = 'held' WHERE id = $3`,
        [status, status === "failed" ? (errorMessage || "Provider reported failure") : null, job.id]
      );
      await client.query(`DELETE FROM job_inputs WHERE job_id = $1`, [job.id]);
      await client.query("COMMIT");
      return res.status(202).json({ ok: true, settlementDeferred: true });
    }

    await settleJob(client, { ...job, completed_at: new Date() }, status);
    await client.query("COMMIT");
    return res.json({ ok: true });

    /* istanbul ignore next -- legacy settlement implementation retained
       temporarily below for migration readability; execution returns above. */
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
