import { getUserAccountId, getPlatformAccountId, postTransaction } from "./ledger.js";
import { buildFairNodeMatch } from "./fairScheduling.js";

const SERVICE_FEE_RATE = 0.10;

// Thrown for the two "couldn't book this" outcomes a caller needs to tell
// apart from a real server error — carries the HTTP status the route
// handler should reply with; the reaper's auto-retry path just treats any
// throw here as "no retry this time" and swallows it.
export class JobMatchError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Matches a node, escrows the full cost, and inserts the job row — the
// core of POST /api/jobs, factored out so the stuck-job reaper's
// auto-retry path (server/src/lib/jobReaper.js) can create a fresh job the
// same way a renter would, instead of duplicating this logic. Caller owns
// the transaction on `client` (BEGIN/COMMIT/ROLLBACK) and must have already
// validated every field — this trusts its input, the way the ledger helpers
// it calls do.
export async function matchAndCreateJob(client, {
  userId, nodeId, workloadId, dockerImage, gpusNeeded, minVramGb, maxRuntimeHours, name, envVars,
  retryOfJobId = null, retryCount = 0, parentJobId = null, deprioritizedOwnerIds = [],
}) {
  // Auto-matching is community fair-share, not an auction won by whichever
  // operator owns the most always-on hardware. Explicit node selection still
  // honors the renter's choice exactly.
  const match = buildFairNodeMatch({ gpusNeeded, minVramGb, nodeId, deprioritizedOwnerIds });
  const nodeRes = await client.query(match.sql, match.params);
  const node = nodeRes.rows[0];
  if (!node) {
    throw new JobMatchError(
      nodeId ? 409 : 404,
      nodeId
        ? "That node is currently unavailable — it may be offline, busy, or under-specced for this job."
        : "No matching node is currently online for this job's requirements."
    );
  }

  const userRes = await client.query(`SELECT balance_usdc FROM users WHERE id = $1 FOR UPDATE`, [userId]);
  const balance = Number(userRes.rows[0].balance_usdc);

  const pricePerHour = Number(node.price_per_hour);
  const subtotal = Math.round(pricePerHour * maxRuntimeHours * 100) / 100;
  const fee = Math.round(subtotal * SERVICE_FEE_RATE * 100) / 100;
  const total = Math.round((subtotal + fee) * 100) / 100;

  if (balance < total) {
    throw new JobMatchError(402, `Insufficient balance — need $${total.toFixed(2)}, have $${balance.toFixed(2)}`);
  }

  const jobRes = await client.query(
    `INSERT INTO jobs (
       user_id, node_id, name, price_per_hour, max_runtime_hours, subtotal_usd, fee_usd, total_usd,
       workload_id, docker_image, gpus_needed, min_vram_gb, env_vars, retry_of_job_id, retry_count, parent_job_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
    [
      userId, node.id, name || `Rental on ${node.name}`, pricePerHour, maxRuntimeHours, subtotal, fee, total,
      workloadId, dockerImage, gpusNeeded, minVramGb, JSON.stringify(envVars), retryOfJobId, retryCount, parentJobId,
    ]
  );
  const job = jobRes.rows[0];

  await client.query(`UPDATE nodes SET last_job_assigned_at = now() WHERE id = $1`, [node.id]);

  const userAccountId = await getUserAccountId(client, userId);
  const platformEscrowId = await getPlatformAccountId(client, "platform_escrow");

  // Debit/credit convention (see server/src/lib/ledger.js): user and
  // platform_escrow are both credit-normal liability accounts, so a hold is
  // +total for user (liability decreasing) and -total for platform_escrow
  // (liability increasing); the real balance change goes through
  // userBalanceDelta separately.
  const txnId = await postTransaction(client, {
    type: "job_escrow_hold",
    referenceType: "job",
    referenceId: job.id,
    lines: [
      { accountId: userAccountId, amount: total },
      { accountId: platformEscrowId, amount: -total },
    ],
    userBalanceDelta: { userId, amount: -total },
  });

  await client.query(`UPDATE jobs SET escrow_transaction_id = $1 WHERE id = $2`, [txnId, job.id]);

  return { job: { ...job, node_name: node.name, node_vram_gb: node.vram_gb }, node };
}
