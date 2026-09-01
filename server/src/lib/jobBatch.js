import { pool, query } from "../db.js";
import { matchAndCreateJob, JobMatchError } from "./jobMatching.js";

// A batch is one user request that decomposes into N independent,
// self-contained outputs (e.g. N images) — the fan-out model discussed at
// length: never split one computation across nodes, just run N ordinary,
// complete jobs concurrently on N different nodes instead of sequentially
// on one. `units` is one envVars-override object per independent output the
// caller wants (e.g. [{prompts:"a cat"}, {prompts:"a cat"}, {prompts:"a
// dog"}] for 2 copies of one prompt + 1 of another) — units get grouped
// across however many nodes are actually available, and each node's group
// gets merged back into one job's envVars (e.g. multiple prompt lines),
// reusing whatever the template's own container already does with multiple
// lines (see job-templates/image-gen/generate.py) rather than teaching the
// backend anything about what a "unit" means.
//
// Every dollar of cost lives on a child, created via the exact same
// matchAndCreateJob a standalone job uses — so escrow, settlement, and the
// stuck-job reaper all apply to a batch child with zero batch-specific
// logic. The parent never holds its own money; its cost/status/progress
// are always derived from its children (see jobRowToApi's batch handling
// in routes/jobs.js), not stored.
export async function createBatchJob({
  userId, workloadId, dockerImage, gpusNeeded, minVramGb, maxRuntimeHours, name, envVars, units,
}) {
  // Rough, unlocked headcount just to decide how many groups to split
  // into — matchAndCreateJob's own FOR UPDATE SKIP LOCKED query is the
  // real availability check per child, so a stale count here only ever
  // costs an uneven split, never a wrong result.
  const { rows } = await query(
    `SELECT count(*) FROM nodes
     WHERE active AND os IN ('windows','linux')
       AND gpu_count >= $1 AND vram_gb >= $2
       AND last_seen_at > now() - interval '90 seconds'
       AND NOT EXISTS (
         SELECT 1 FROM jobs j2 WHERE j2.node_id = nodes.id AND j2.status IN ('pending','running')
       )`,
    [gpusNeeded, minVramGb]
  );
  const availableNodes = Number(rows[0].count);
  const groupCount = Math.max(1, Math.min(units.length, availableNodes || 1));
  const groups = Array.from({ length: groupCount }, () => []);
  units.forEach((unit, i) => groups[i % groupCount].push(unit));

  // The parent is created and committed on its own, before any child
  // exists — a child's parent_job_id FK has to point at something another
  // connection can already see, which an uncommitted insert on a different
  // transaction is not.
  const parentClient = await pool.connect();
  let parent;
  try {
    await parentClient.query("BEGIN");
    const parentRes = await parentClient.query(
      `INSERT INTO jobs (
         user_id, name, price_per_hour, max_runtime_hours, subtotal_usd, fee_usd, total_usd,
         workload_id, docker_image, gpus_needed, min_vram_gb, env_vars, status
       ) VALUES ($1,$2,0,$3,0,0,0,$4,$5,$6,$7,$8,'pending') RETURNING *`,
      [userId, name || "Batch job", maxRuntimeHours, workloadId, dockerImage, gpusNeeded, minVramGb, JSON.stringify(envVars)]
    );
    parent = parentRes.rows[0];
    await parentClient.query("COMMIT");
  } catch (err) {
    await parentClient.query("ROLLBACK");
    throw err;
  } finally {
    parentClient.release();
  }

  // Each child is its own transaction — one group failing to find a node
  // must not undo groups that already matched successfully. Matches the
  // same isolate-and-continue shape as the reaper's auto-retry savepoint,
  // just at transaction granularity instead of savepoint granularity since
  // there's no shared outer transaction to protect here.
  // Track people/operators, not just machine IDs: a well-funded provider
  // with many listings should not take every unit while compatible home
  // providers are waiting online.
  const children = [];
  const usedOwnerIds = [];
  for (const group of groups) {
    const mergedEnvVars = { ...envVars };
    for (const key of Object.keys(group[0] || {})) {
      mergedEnvVars[key] = group.map((u) => u[key]).join("\n");
    }

    const childClient = await pool.connect();
    try {
      await childClient.query("BEGIN");
      const { job, node } = await matchAndCreateJob(childClient, {
        userId, nodeId: null, workloadId, dockerImage, gpusNeeded, minVramGb, maxRuntimeHours,
        name: name || "Batch job", envVars: mergedEnvVars, parentJobId: parent.id,
        // Prefer a different human/operator for each child before reusing an
        // owner with several machines. The fair matcher falls back to a reused
        // owner when that is the only compatible capacity available.
        deprioritizedOwnerIds: usedOwnerIds,
      });
      await childClient.query("COMMIT");
      children.push(job);
      if (node.owner_id && !usedOwnerIds.includes(node.owner_id)) usedOwnerIds.push(node.owner_id);
    } catch (err) {
      await childClient.query("ROLLBACK");
      if (!(err instanceof JobMatchError)) throw err;
      // No node available for this group — fewer images delivered, not a
      // failed batch. Handled below if literally nothing could be matched.
    } finally {
      childClient.release();
    }
  }

  if (children.length === 0) {
    await query(`UPDATE jobs SET status = 'failed', completed_at = now() WHERE id = $1`, [parent.id]);
    throw new JobMatchError(404, "No matching node is currently online for this job's requirements.");
  }

  return { parent, children };
}

// Aggregates a parent's children into the single job-shaped view the
// frontend already knows how to render — status/cost/progress derived
// fresh every read, never cached, so it can never drift from reality the
// way a stored aggregate could if an update was ever missed.
export async function getBatchChildren(parentId) {
  const { rows } = await query(
    `SELECT j.*, n.name AS node_name, n.vram_gb AS node_vram_gb,
       (SELECT 1 FROM job_artifacts a WHERE a.job_id = j.id LIMIT 1) IS NOT NULL AS has_artifact
     FROM jobs j LEFT JOIN nodes n ON n.id = j.node_id
     WHERE j.parent_job_id = $1 ORDER BY j.created_at ASC`,
    [parentId]
  );
  return rows;
}
