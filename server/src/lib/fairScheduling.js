// Community-first automatic matching. Fairness only competes among nodes
// priced within 35% of the cheapest currently eligible option, so spreading
// earnings never turns into an unbounded surprise cost for the renter.
export const FAIR_PRICE_MULTIPLIER = 1.35;
export const FAIR_EARNINGS_WINDOW_DAYS = 7;

function eligibility(alias, vendorParam = null) {
  return `${alias}.active AND ${alias}.os IN ('windows','linux')
    AND ${alias}.gpu_count >= $1 AND ${alias}.vram_gb >= $2
    ${vendorParam ? `AND lower(${alias}.gpu_vendor) = ANY(${vendorParam}::text[])` : ""}
    AND ${alias}.last_seen_at > now() - interval '90 seconds'
    AND NOT EXISTS (
      SELECT 1 FROM jobs busy_job
      WHERE busy_job.node_id = ${alias}.id AND busy_job.status IN ('pending','running')
    )`;
}

export function buildFairNodeMatch({
  gpusNeeded,
  minVramGb,
  nodeId = null,
  deprioritizedOwnerIds = [],
  modelId = null,
  gpuVendors = [],
}) {
  const params = [gpusNeeded, minVramGb];
  let vendorParam = null;
  if (gpuVendors.length > 0) {
    params.push(gpuVendors.map((v) => String(v).toLowerCase()));
    vendorParam = `$${params.length}`;
  }
  const where = [eligibility("n", vendorParam)];

  if (nodeId) {
    params.push(nodeId);
    where.push(`n.id = $${params.length}`);
  }

  const order = [];
  if (!nodeId) {
    const cheapestEligible = `(SELECT MIN(candidate.price_per_hour)
      FROM nodes candidate WHERE ${eligibility("candidate", vendorParam)})`;
    where.push(`n.price_per_hour <= (${cheapestEligible}) * ${FAIR_PRICE_MULTIPLIER}`);

    if (deprioritizedOwnerIds.length > 0) {
      params.push(deprioritizedOwnerIds);
      order.push(`CASE WHEN n.owner_id = ANY($${params.length}::uuid[]) THEN 1 ELSE 0 END`);
    }

    // Measure earnings across all nodes belonging to one owner. Otherwise a
    // well-funded operator could gain priority simply by adding more listings.
    order.push(`COALESCE((
      SELECT SUM(earned_job.billed_subtotal_usd)
      FROM jobs earned_job
      JOIN nodes earning_node ON earning_node.id = earned_job.node_id
      WHERE earning_node.owner_id = n.owner_id
        AND earned_job.status = 'done'
        AND earned_job.completed_at > now() - interval '${FAIR_EARNINGS_WINDOW_DAYS} days'
    ), 0) ASC`);
    // Wait time is also owner-level. After one machine in a fleet receives a
    // job, that operator goes behind another person who is still waiting.
    order.push(`COALESCE((
      SELECT MAX(owner_node.last_job_assigned_at)
      FROM nodes owner_node
      WHERE owner_node.owner_id = n.owner_id
    ), n.last_job_assigned_at) ASC NULLS FIRST`);

    // Capabilities break ties after owner-level opportunity. A cached model
    // avoids cold downloads; reliability protects renters; measured compute
    // and bandwidth distinguish otherwise similar GPU models without making
    // expensive always-on fleets jump ahead of people who have earned less.
    if (modelId) {
      params.push(modelId);
      order.push(`CASE WHEN n.cached_models ? $${params.length} THEN 0 ELSE 1 END`);
    }
    order.push("n.reliability_score DESC");
    order.push("n.gpu_benchmark_score DESC NULLS LAST");
    order.push("n.network_download_mbps DESC NULLS LAST");
    order.push("n.network_upload_mbps DESC NULLS LAST");
  }
  order.push("n.price_per_hour ASC");

  return {
    params,
    sql: `SELECT n.id, n.name, n.price_per_hour, n.vram_gb, n.owner_id, n.gpu_model,
        n.reliability_score, n.cached_models, n.gpu_benchmark_score,
        n.network_download_mbps, n.network_upload_mbps
      FROM nodes n
      WHERE ${where.join(" AND ")}
      ORDER BY ${order.join(", ")}
      LIMIT 1 FOR UPDATE OF n SKIP LOCKED`,
  };
}
