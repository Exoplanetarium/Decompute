import { Router } from "express";
import rateLimit from "express-rate-limit";
import { pool, query } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { idempotent } from "../middleware/idempotency.js";
import { getUserAccountId, getPlatformAccountId, postTransaction } from "../lib/ledger.js";

export const jobsRouter = Router();

// 3 minutes — low enough for short jobs (e.g. image generation) to book a
// realistic ceiling instead of a 1-hour ceiling they finish in a fraction
// of, which is what made progress/ETA (elapsed / max_runtime_hours) nearly
// meaningless for that template.
const MIN_HOURS = 0.05;
const MAX_HOURS = 72;
const SERVICE_FEE_RATE = 0.10;
const GPUS_MIN = 1, GPUS_MAX = 16;
const VRAM_MIN = 0, VRAM_MAX = 256;

// The two mutating routes (create, cancel) get the strict limit money-moving
// routes elsewhere in the app use. The polling GETs LiveJobView hits every
// 3s (heartbeats and logs, in parallel) need a much more generous one —
// mirrors the layered detectLimiter-on-nodesLimiter pattern in nodes.js.
const jobsMutationLimiter = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false });
const jobsPollLimiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });

function inRange(n, min, max) {
  return Number.isFinite(n) && n >= min && n <= max;
}

function jobRowToApi(row) {
  return {
    id: row.id,
    name: row.name,
    node_name: row.node_name,
    node_vram_gb: row.node_vram_gb,
    status: row.status,
    started_at: row.started_at,
    max_runtime_hours: row.max_runtime_hours,
    estimated_cost: row.total_usd,
    // billed_*_usd is the real, prorated amount kept after settlement —
    // total_usd is only the original escrow hold for the full
    // max_runtime_hours, which is almost always more than what's actually
    // charged once the unused portion is refunded.
    actual_cost: row.status === "done" ? row.billed_total_usd : row.status === "failed" ? "0.00" : null,
    avg_gpu_usage: null,
    statusMessage: null,
    has_artifact: row.has_artifact,
  };
}

const ARTIFACT_JOIN = `(SELECT 1 FROM job_artifacts a WHERE a.job_id = j.id LIMIT 1) IS NOT NULL AS has_artifact`;

jobsRouter.get("/", requireAuth, jobsPollLimiter, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const { rows } = await query(
    `SELECT j.*, n.name AS node_name, n.vram_gb AS node_vram_gb, ${ARTIFACT_JOIN} FROM jobs j
     LEFT JOIN nodes n ON n.id = j.node_id
     WHERE j.user_id = $1 ORDER BY j.created_at DESC LIMIT $2`,
    [req.userId, limit]
  );
  res.json({ data: rows.map(jobRowToApi) });
});

// Single-job status — LiveJobView polls this alongside heartbeats/logs so
// it can notice a job it opened while still "pending" transition to
// "running" (and eventually "done"/"failed") without the caller needing to
// re-fetch the whole list.
jobsRouter.get("/:id", requireAuth, jobsPollLimiter, async (req, res) => {
  const { rows } = await query(
    `SELECT j.*, n.name AS node_name, n.vram_gb AS node_vram_gb, ${ARTIFACT_JOIN} FROM jobs j
     LEFT JOIN nodes n ON n.id = j.node_id
     WHERE j.id = $1 AND j.user_id = $2`,
    [req.params.id, req.userId]
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json({ data: jobRowToApi(rows[0]) });
});

// Ownership-scoped read access shared by the two polling routes below —
// job_heartbeats/job_logs have no user_id of their own, so every read goes
// through this check first rather than trusting the job id alone.
async function ownsJob(jobId, userId) {
  const { rows } = await query(`SELECT 1 FROM jobs WHERE id = $1 AND user_id = $2`, [jobId, userId]);
  return !!rows[0];
}

jobsRouter.get("/:id/heartbeats", requireAuth, jobsPollLimiter, async (req, res) => {
  if (!(await ownsJob(req.params.id, req.userId))) return res.status(404).json({ error: "Not found" });
  const { rows } = await query(
    `SELECT recorded_at, gpu_usage_pct, vram_used_gb FROM (
       SELECT * FROM job_heartbeats WHERE job_id = $1 ORDER BY recorded_at DESC LIMIT 500
     ) t ORDER BY recorded_at ASC`,
    [req.params.id]
  );
  res.json({ data: rows });
});

jobsRouter.get("/:id/logs", requireAuth, jobsPollLimiter, async (req, res) => {
  if (!(await ownsJob(req.params.id, req.userId))) return res.status(404).json({ error: "Not found" });
  const { rows } = await query(
    `SELECT id, ts, level, msg FROM (
       SELECT * FROM job_logs WHERE job_id = $1 ORDER BY id DESC LIMIT 500
     ) t ORDER BY id ASC`,
    [req.params.id]
  );
  res.json({ data: rows });
});

jobsRouter.get("/:id/artifact", requireAuth, jobsPollLimiter, async (req, res) => {
  if (!(await ownsJob(req.params.id, req.userId))) return res.status(404).json({ error: "Not found" });
  const { rows } = await query(
    `SELECT content_type, data FROM job_artifacts WHERE job_id = $1 ORDER BY id DESC LIMIT 1`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "This job has no output file" });
  res.setHeader("Content-Type", rows[0].content_type);
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  res.send(rows[0].data);
});

// Creates a job and holds its full cost in escrow. Matching a node happens
// synchronously here, not via a background worker — this codebase has
// deliberately never had one, and it keeps "no match" an immediate, visible
// failure instead of a job silently stuck at pending forever (which is what
// happened before this route did any matching at all). Price is read from
// the matched node's own row — a client-submitted price is never trusted.
// One DB transaction, node row and user row both locked, so two concurrent
// submissions can't race the same node or a stale balance.
jobsRouter.post("/", requireAuth, jobsMutationLimiter, idempotent("jobs"), async (req, res) => {
  const nodeId = req.body?.nodeId ? String(req.body.nodeId) : null;
  const dockerImage = req.body?.dockerImage ? String(req.body.dockerImage).trim().slice(0, 300) : "";
  const gpusNeeded = req.body?.gpusNeeded !== undefined ? Number(req.body.gpusNeeded) : 1;
  const minVramGb = req.body?.minVramGb !== undefined ? Number(req.body.minVramGb) : 0;
  const maxRuntimeHours = Number(req.body?.maxRuntimeHours);
  const name = req.body?.name ? String(req.body.name).slice(0, 200) : null;

  if (!dockerImage) return res.status(400).json({ error: "dockerImage is required" });
  if (!Number.isFinite(maxRuntimeHours) || maxRuntimeHours < MIN_HOURS || maxRuntimeHours > MAX_HOURS) {
    return res.status(400).json({ error: `maxRuntimeHours must be between ${MIN_HOURS} and ${MAX_HOURS}` });
  }
  if (!inRange(gpusNeeded, GPUS_MIN, GPUS_MAX)) {
    return res.status(400).json({ error: `gpusNeeded must be between ${GPUS_MIN} and ${GPUS_MAX}` });
  }
  if (!inRange(minVramGb, VRAM_MIN, VRAM_MAX)) {
    return res.status(400).json({ error: `minVramGb must be between ${VRAM_MIN} and ${VRAM_MAX}` });
  }

  const envVarsIn = req.body?.envVars && typeof req.body.envVars === "object" ? req.body.envVars : {};
  const envVars = {};
  for (const [k, v] of Object.entries(envVarsIn).slice(0, 50)) {
    envVars[String(k).slice(0, 100)] = String(v).slice(0, 2000);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // A node is a candidate if it's listed, execution-capable (Mac nodes
    // stay listing-only for now), meets the job's resource needs, has
    // pinged its liveness heartbeat recently, and isn't already tied up
    // with another non-terminal job (one job at a time per node — v1 has
    // no fractional/multi-tenant scheduling). SKIP LOCKED lets a second
    // concurrent request fall through to the next-cheapest candidate
    // instead of blocking on a node this request is about to claim — the
    // same mechanism that makes the one-job-per-node rule race-safe.
    const matchParams = [gpusNeeded, minVramGb];
    let matchSql = `
      SELECT id, name, price_per_hour, vram_gb FROM nodes
      WHERE active AND os IN ('windows','linux')
        AND gpu_count >= $1 AND vram_gb >= $2
        AND last_seen_at > now() - interval '90 seconds'
        AND NOT EXISTS (
          SELECT 1 FROM jobs j2 WHERE j2.node_id = nodes.id AND j2.status IN ('pending','running')
        )`;
    if (nodeId) {
      matchParams.push(nodeId);
      matchSql += ` AND id = $3`;
    }
    matchSql += ` ORDER BY price_per_hour ASC LIMIT 1 FOR UPDATE SKIP LOCKED`;

    const nodeRes = await client.query(matchSql, matchParams);
    const node = nodeRes.rows[0];
    if (!node) {
      await client.query("ROLLBACK");
      return nodeId
        ? res.status(409).json({ error: "That node is currently unavailable — it may be offline, busy, or under-specced for this job." })
        : res.status(404).json({ error: "No matching node is currently online for this job's requirements." });
    }
    // FUTURE HOOK: re-verification at session start — require a fresh
    // pairing-code + helper re-run before matching if last_verified_at is
    // stale, reusing the same POST /api/nodes/detect mechanism. Not
    // implemented this pass.

    // Lock the user's row for the duration of the balance check + debit.
    const userRes = await client.query(
      `SELECT balance_usdc FROM users WHERE id = $1 FOR UPDATE`,
      [req.userId]
    );
    const balance = Number(userRes.rows[0].balance_usdc);

    const pricePerHour = Number(node.price_per_hour);
    const subtotal = Math.round(pricePerHour * maxRuntimeHours * 100) / 100;
    const fee = Math.round(subtotal * SERVICE_FEE_RATE * 100) / 100;
    const total = Math.round((subtotal + fee) * 100) / 100;

    if (balance < total) {
      await client.query("ROLLBACK");
      return res.status(402).json({ error: `Insufficient balance — need $${total.toFixed(2)}, have $${balance.toFixed(2)}` });
    }

    const jobRes = await client.query(
      `INSERT INTO jobs (
         user_id, node_id, name, price_per_hour, max_runtime_hours, subtotal_usd, fee_usd, total_usd,
         docker_image, gpus_needed, min_vram_gb, env_vars
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        req.userId, node.id, name || `Rental on ${node.name}`, pricePerHour, maxRuntimeHours, subtotal, fee, total,
        dockerImage, gpusNeeded, minVramGb, JSON.stringify(envVars),
      ]
    );
    const job = jobRes.rows[0];

    const userAccountId = await getUserAccountId(client, req.userId);
    const platformEscrowId = await getPlatformAccountId(client, "platform_escrow");

    // Debit/credit convention (see server/src/lib/ledger.js callers): user
    // and platform_escrow are both credit-normal liability accounts, so a
    // hold is recorded as +total for user (liability decreasing) and -total
    // for platform_escrow (liability increasing). The real, intuitive
    // balance change goes through userBalanceDelta separately.
    const txnId = await postTransaction(client, {
      type: "job_escrow_hold",
      referenceType: "job",
      referenceId: job.id,
      lines: [
        { accountId: userAccountId, amount: total },
        { accountId: platformEscrowId, amount: -total },
      ],
      userBalanceDelta: { userId: req.userId, amount: -total },
    });

    await client.query(`UPDATE jobs SET escrow_transaction_id = $1 WHERE id = $2`, [txnId, job.id]);

    await client.query("COMMIT");
    res.status(201).json({ data: jobRowToApi({ ...job, node_name: node.name, node_vram_gb: node.vram_gb }) });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

jobsRouter.post("/:id/cancel", requireAuth, jobsMutationLimiter, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const jobRes = await client.query(
      `SELECT * FROM jobs WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [req.params.id, req.userId]
    );
    const job = jobRes.rows[0];
    if (!job) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Not found" });
    }
    if (job.status !== "pending") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: `Job is already ${job.status} and can't be cancelled` });
    }

    const total = Number(job.total_usd);
    const userAccountId = await getUserAccountId(client, req.userId);
    const platformEscrowId = await getPlatformAccountId(client, "platform_escrow");

    const txnId = await postTransaction(client, {
      type: "job_refund",
      referenceType: "job",
      referenceId: job.id,
      lines: [
        { accountId: platformEscrowId, amount: total },
        { accountId: userAccountId, amount: -total },
      ],
      userBalanceDelta: { userId: req.userId, amount: total },
    });

    await client.query(
      `UPDATE jobs SET status = 'cancelled', settlement_transaction_id = $1 WHERE id = $2`,
      [txnId, job.id]
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
