// Community-first automatic matching. Fairness only competes among nodes
// priced within 35% of the cheapest currently eligible option, so spreading
// earnings never turns into an unbounded surprise cost for the renter.
export const FAIR_PRICE_MULTIPLIER = 1.35;
export const FAIR_EARNINGS_WINDOW_DAYS = 7;

function eligibility(alias) {
  return `${alias}.active AND ${alias}.os IN ('windows','linux')
    AND ${alias}.gpu_count >= $1 AND ${alias}.vram_gb >= $2
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
}) {
  const params = [gpusNeeded, minVramGb];
  const where = [eligibility("n")];

  if (nodeId) {
    params.push(nodeId);
    where.push(`n.id = $${params.length}`);
  }

  const order = [];
  if (!nodeId) {
    const cheapestEligible = `(SELECT MIN(candidate.price_per_hour)
      FROM nodes candidate WHERE ${eligibility("candidate")})`;
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
  }
  order.push("n.price_per_hour ASC");

  return {
    params,
    sql: `SELECT n.id, n.name, n.price_per_hour, n.vram_gb, n.owner_id
      FROM nodes n
      WHERE ${where.join(" AND ")}
      ORDER BY ${order.join(", ")}
      LIMIT 1 FOR UPDATE OF n SKIP LOCKED`,
  };
}
