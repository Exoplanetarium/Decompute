import { Router } from "express";
import rateLimit from "express-rate-limit";
import { pool, query } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { idempotent } from "../middleware/idempotency.js";
import { getUserAccountId, getPlatformAccountId, postTransaction } from "../lib/ledger.js";
import { matchAndCreateJob, JobMatchError } from "../lib/jobMatching.js";
import { createBatchJob, getBatchChildren } from "../lib/jobBatch.js";
import { getWorkload, listWorkloads, sanitizeWorkloadInputs } from "../lib/workloadCatalog.js";
import { ZipArchive } from "archiver";

export const jobsRouter = Router();

// 3 minutes — low enough for short jobs (e.g. image generation) to book a
// realistic ceiling instead of a 1-hour ceiling they finish in a fraction
// of, which is what made progress/ETA (elapsed / max_runtime_hours) nearly
// meaningless for that template.
const MIN_HOURS = 0.05;
const MAX_HOURS = 72;
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

// A batch parent (see server/src/lib/jobBatch.js) holds none of its own
// execution state — status/cost/progress are derived fresh from its
// children every time, via the aggregate columns BATCH_JOIN adds to the
// query, never stored on the parent row itself.
function jobRowToApi(row) {
  const childCount = Number(row.child_count || 0);
  if (childCount > 0) {
    const pending = Number(row.child_pending_count || 0);
    const running = Number(row.child_running_count || 0);
    const done = Number(row.child_done_count || 0);
    const failed = Number(row.child_failed_count || 0);
    const finished = done + failed;
    // Running while anything's still in flight; failed only if every
    // child failed — a batch with at least one success still has a
    // usable result, unlike a single job where a failure means nothing.
    const status = running > 0 ? "running" : pending > 0 ? "pending" : done > 0 ? "done" : "failed";
    return {
      id: row.id,
      name: row.name,
      node_name: `${childCount} node${childCount === 1 ? "" : "s"}`,
      node_vram_gb: row.node_vram_gb,
      status,
      started_at: row.child_min_started_at,
      max_runtime_hours: row.max_runtime_hours,
      estimated_cost: row.child_estimated_total,
      actual_cost: finished === childCount ? row.child_actual_total : null,
      avg_gpu_usage: null,
      // A real, counted fraction — better than the time-based estimate a
      // single job has to fall back on — so the frontend prefers this for
      // a batch's progress bar when present (see jobFromApi).
      progress_fraction: childCount > 0 ? finished / childCount : 0,
      statusMessage: `${finished}/${childCount} finished (${done} done${failed ? `, ${failed} failed` : ""})`,
      has_artifact: row.child_artifact_count > 0,
      docker_image: row.docker_image,
      workload_id: row.workload_id,
      execution_source: row.execution_source,
      gpus_needed: row.gpus_needed,
      min_vram_gb: row.min_vram_gb,
      env_vars: row.env_vars,
      retry_of_job_id: row.retry_of_job_id,
      retry_count: row.retry_count,
      is_batch: true,
      child_count: childCount,
    };
  }

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
    statusMessage: row.failure_reason || null,
    has_artifact: row.has_artifact,
    // The original submission spec — lets the frontend offer "Retry with
    // the same settings" on a failed job (notably one the stuck-job reaper
    // refunded) without the renter re-entering anything.
    docker_image: row.docker_image,
    workload_id: row.workload_id,
    execution_source: row.execution_source,
    gpus_needed: row.gpus_needed,
    min_vram_gb: row.min_vram_gb,
    env_vars: row.env_vars,
    retry_of_job_id: row.retry_of_job_id,
    retry_count: row.retry_count,
    is_batch: false,
    parent_job_id: row.parent_job_id,
  };
}

const ARTIFACT_JOIN = `(SELECT 1 FROM job_artifacts a WHERE a.job_id = j.id LIMIT 1) IS NOT NULL AS has_artifact`;

// One-shot aggregate of a batch parent's children, computed fresh in the
// same query as the parent row — no batch-specific storage, no N+1 queries
// for the list endpoint. Zero for every column when j isn't a parent (the
// subqueries just find no matching rows), which is what makes childCount
// === 0 the reliable "this is an ordinary job" signal in jobRowToApi above.
const BATCH_JOIN = `
  (SELECT count(*) FROM jobs c WHERE c.parent_job_id = j.id) AS child_count,
  (SELECT count(*) FROM jobs c WHERE c.parent_job_id = j.id AND c.status = 'pending') AS child_pending_count,
  (SELECT count(*) FROM jobs c WHERE c.parent_job_id = j.id AND c.status = 'running') AS child_running_count,
  (SELECT count(*) FROM jobs c WHERE c.parent_job_id = j.id AND c.status = 'done') AS child_done_count,
  (SELECT count(*) FROM jobs c WHERE c.parent_job_id = j.id AND c.status IN ('failed','cancelled')) AS child_failed_count,
  (SELECT count(*) FROM jobs c WHERE c.parent_job_id = j.id AND EXISTS (SELECT 1 FROM job_artifacts a WHERE a.job_id = c.id)) AS child_artifact_count,
  (SELECT min(c.started_at) FROM jobs c WHERE c.parent_job_id = j.id) AS child_min_started_at,
  (SELECT COALESCE(sum(c.total_usd), 0) FROM jobs c WHERE c.parent_job_id = j.id) AS child_estimated_total,
  (SELECT COALESCE(sum(CASE WHEN c.status = 'done' THEN c.billed_total_usd WHEN c.status IN ('failed','cancelled') THEN 0 ELSE NULL END), 0)
     FROM jobs c WHERE c.parent_job_id = j.id) AS child_actual_total`;

jobsRouter.get("/", requireAuth, jobsPollLimiter, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  // parent_job_id IS NULL excludes batch children from the list — a batch
  // shows as the one parent row it is to the renter, not N extra rows.
  const { rows } = await query(
    `SELECT j.*, n.name AS node_name, n.vram_gb AS node_vram_gb, ${ARTIFACT_JOIN}, ${BATCH_JOIN} FROM jobs j
     LEFT JOIN nodes n ON n.id = j.node_id
     WHERE j.user_id = $1 AND j.parent_job_id IS NULL ORDER BY j.created_at DESC LIMIT $2`,
    [req.userId, limit]
  );
  res.json({ data: rows.map(jobRowToApi) });
});

// Public capability discovery lets the frontend hide templates that have no
// operator-configured, immutable image. Image references themselves stay
// private; callers only need stable workload IDs and resource requirements.
jobsRouter.get("/workloads", jobsPollLimiter, (req, res) => {
  res.json({ data: listWorkloads() });
});

// Single-job status — LiveJobView polls this alongside heartbeats/logs so
// it can notice a job it opened while still "pending" transition to
// "running" (and eventually "done"/"failed") without the caller needing to
// re-fetch the whole list. For a batch parent, also includes each child's
// own status so the view can show per-node progress, not just the total.
jobsRouter.get("/:id", requireAuth, jobsPollLimiter, async (req, res) => {
  const { rows } = await query(
    `SELECT j.*, n.name AS node_name, n.vram_gb AS node_vram_gb, ${ARTIFACT_JOIN}, ${BATCH_JOIN} FROM jobs j
     LEFT JOIN nodes n ON n.id = j.node_id
     WHERE j.id = $1 AND j.user_id = $2`,
    [req.params.id, req.userId]
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });

  const data = jobRowToApi(rows[0]);
  if (data.is_batch) {
    const children = await getBatchChildren(req.params.id);
    data.children = children.map(jobRowToApi);
  }
  res.json({ data });
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

  // A batch parent has no job_artifacts row of its own — every real output
  // lives on a child. Zip together whichever children actually produced
  // one, on the fly, rather than storing a duplicate aggregate copy that
  // could drift from the children if a late one finishes after the fact.
  const children = await getBatchChildren(req.params.id);
  if (children.length > 0) {
    const { rows: artifacts } = await query(
      `SELECT job_id, content_type, data FROM job_artifacts WHERE job_id = ANY($1::uuid[])
       AND id IN (SELECT max(id) FROM job_artifacts WHERE job_id = ANY($1::uuid[]) GROUP BY job_id)`,
      [children.map((c) => c.id)]
    );
    if (artifacts.length === 0) return res.status(404).json({ error: "This batch has no output files yet" });

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="batch-results.zip"`);
    const archive = new ZipArchive({ zlib: { level: 6 } });
    archive.on("error", (err) => { console.error("Batch zip failed:", err); res.destroy(err); });
    archive.pipe(res);
    artifacts.forEach((a, i) => {
      // A child that itself produced more than one image (fewer nodes were
      // available than requested units, so it absorbed several) already
      // zipped its own output — detected here by the zip magic bytes
      // ("PK") rather than trusting content_type, since agent.js's artifact
      // whitelist collapses anything non-image to generic octet-stream.
      // KNOWN GAP: that inner zip is nested as one entry here rather than
      // flattened into its own individual images — correct but suboptimal;
      // flattening needs a zip *reader*, not just archiver's writer.
      const isZip = a.data.length >= 2 && a.data[0] === 0x50 && a.data[1] === 0x4b;
      const ext = isZip ? "zip" : a.content_type === "image/jpeg" ? "jpg" : (a.content_type.split("/")[1] || "bin");
      archive.append(a.data, { name: `result-${String(i + 1).padStart(2, "0")}.${ext}` });
    });
    archive.finalize();
    return;
  }

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
  const workloadId = req.body?.workloadId ? String(req.body.workloadId).trim().slice(0, 100) : "";
  const executionSource = req.body?.executionSource === undefined ? "community" : String(req.body.executionSource);
  const name = req.body?.name ? String(req.body.name).slice(0, 200) : null;

  if (req.body?.dockerImage !== undefined) {
    return res.status(400).json({ error: "dockerImage is not accepted; choose a curated workloadId" });
  }
  if (executionSource !== "community") {
    return res.status(400).json({ error: "Only community-network execution is supported" });
  }
  if (!workloadId) return res.status(400).json({ error: "workloadId is required" });
  const workload = getWorkload(workloadId);
  if (!workload) return res.status(400).json({ error: "That workload is not available on this deployment" });

  const dockerImage = workload.image;
  const gpusNeeded = workload.gpusNeeded;
  const minVramGb = workload.minVramGb;
  const requestedRuntime = req.body?.maxRuntimeHours === undefined
    ? workload.defaultRuntimeHours
    : Number(req.body.maxRuntimeHours);
  const maxRuntimeHours = requestedRuntime;
  if (!Number.isFinite(maxRuntimeHours) || maxRuntimeHours < MIN_HOURS || maxRuntimeHours > workload.maxRuntimeHours) {
    return res.status(400).json({ error: `maxRuntimeHours must be between ${MIN_HOURS} and ${workload.maxRuntimeHours} for this workload` });
  }
  // Defense in depth for a malformed catalog entry.
  if (!inRange(gpusNeeded, GPUS_MIN, GPUS_MAX) || !inRange(minVramGb, VRAM_MIN, VRAM_MAX) || maxRuntimeHours > MAX_HOURS) {
    throw new Error(`Invalid resource policy for workload ${workloadId}`);
  }

  const { envVars, units: sanitizedUnits } = sanitizeWorkloadInputs(
    workload, req.body?.envVars, req.body?.units
  );

  // `units` — one envVars-override object per independent output the
  // caller wants (see server/src/lib/jobBatch.js) — is how a template opts
  // into fan-out. Its shape is opaque to this route on purpose: it's
  // whichever fields that template's own container reads multiple lines
  // of (e.g. image-gen's "prompts"), not something the backend needs to
  // understand. Anything else behaves exactly as a single job always has.
  if (sanitizedUnits && sanitizedUnits.length > 1) {
    try {
      const { parent } = await createBatchJob({
        userId: req.userId, workloadId, dockerImage, gpusNeeded, minVramGb, maxRuntimeHours,
        name, envVars, units: sanitizedUnits,
      });
      // createBatchJob's returned row is a plain INSERT ... RETURNING *,
      // without the BATCH_JOIN aggregates jobRowToApi needs to render a
      // parent correctly — re-fetch with them now that the children exist.
      const { rows } = await query(`SELECT j.*, ${BATCH_JOIN} FROM jobs j WHERE j.id = $1`, [parent.id]);
      return res.status(201).json({ data: jobRowToApi(rows[0]) });
    } catch (err) {
      if (err instanceof JobMatchError) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // FUTURE HOOK: re-verification at session start — require a fresh
    // pairing-code + helper re-run before matching if last_verified_at is
    // stale, reusing the same POST /api/nodes/detect mechanism. Not
    // implemented this pass.
    const { job } = await matchAndCreateJob(client, {
      userId: req.userId, nodeId, workloadId, dockerImage, gpusNeeded, minVramGb, maxRuntimeHours, name, envVars,
    });
    await client.query("COMMIT");
    res.status(201).json({ data: jobRowToApi(job) });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err instanceof JobMatchError) return res.status(err.status).json({ error: err.message });
    throw err;
  } finally {
    client.release();
  }
});

// Refunds and cancels one already-locked, already-verified-pending job row.
// Shared by the plain single-job path below and by batch cancellation,
// where it runs once per still-pending child in its own transaction — a
// parent's own `status` column is never anything but the 'pending' it was
// inserted with (real status is always derived from children), so it must
// never be cancelled directly the way a plain job is.
async function cancelOneJob(client, job, userId) {
  const total = Number(job.total_usd);
  const userAccountId = await getUserAccountId(client, userId);
  const platformEscrowId = await getPlatformAccountId(client, "platform_escrow");

  const txnId = await postTransaction(client, {
    type: "job_refund",
    referenceType: "job",
    referenceId: job.id,
    lines: [
      { accountId: platformEscrowId, amount: total },
      { accountId: userAccountId, amount: -total },
    ],
    userBalanceDelta: { userId, amount: total },
  });

  await client.query(
    `UPDATE jobs SET status = 'cancelled', settlement_transaction_id = $1 WHERE id = $2`,
    [txnId, job.id]
  );
}

jobsRouter.post("/:id/cancel", requireAuth, jobsMutationLimiter, async (req, res) => {
  const owned = await query(`SELECT id FROM jobs WHERE id = $1 AND user_id = $2`, [req.params.id, req.userId]);
  if (!owned.rows[0]) return res.status(404).json({ error: "Not found" });

  const children = await getBatchChildren(req.params.id);
  if (children.length > 0) {
    // Cancel every child that hasn't started yet — one still isn't
    // cancellable just because another already is or already finished,
    // same "partial success is fine" shape as everything else about a
    // batch. 409 only if there was nothing left to cancel at all.
    let cancelledCount = 0;
    for (const child of children.filter((c) => c.status === "pending")) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows } = await client.query(
          `SELECT * FROM jobs WHERE id = $1 AND status = 'pending' FOR UPDATE`, [child.id]
        );
        if (rows[0]) {
          await cancelOneJob(client, rows[0], req.userId);
          cancelledCount++;
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }
    if (cancelledCount === 0) return res.status(409).json({ error: "No part of this batch is still pending" });
    return res.json({ ok: true, cancelledCount });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const jobRes = await client.query(
      `SELECT * FROM jobs WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [req.params.id, req.userId]
    );
    const job = jobRes.rows[0];
    if (job.status !== "pending") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: `Job is already ${job.status} and can't be cancelled` });
    }
    await cancelOneJob(client, job, req.userId);
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});
