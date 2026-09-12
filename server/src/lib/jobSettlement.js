import { pool, query } from "../db.js";
import { getUserAccountId, getPlatformAccountId, postTransaction } from "./ledger.js";
import { incidentModeEnabled } from "./incidentMode.js";

const SERVICE_FEE_RATE = 0.10;

export async function settleJob(client, job, status) {
  if (job.settlement_state && job.settlement_state !== "held") return null;
  const total = Number(job.total_usd);
  const renterAccountId = await getUserAccountId(client, job.user_id);
  const platformEscrowId = await getPlatformAccountId(client, "platform_escrow");
  let settlementTxnId;
  let billedSubtotal = 0, billedFee = 0, billedTotal = 0;

  if (status === "failed") {
    settlementTxnId = await postTransaction(client, {
      type: "job_refund", referenceType: "job", referenceId: job.id,
      lines: [
        { accountId: platformEscrowId, amount: total },
        { accountId: renterAccountId, amount: -total },
      ],
      userBalanceDelta: { userId: job.user_id, amount: total },
    });
  } else {
    const end = job.completed_at ? new Date(job.completed_at).getTime() : Date.now();
    const elapsedHours = Math.max(0, (end - new Date(job.started_at).getTime()) / 3_600_000);
    const billedHours = Math.min(Number(job.max_runtime_hours), elapsedHours);
    billedSubtotal = Math.round(Number(job.price_per_hour) * billedHours * 100) / 100;
    billedFee = Math.round(billedSubtotal * SERVICE_FEE_RATE * 100) / 100;
    billedTotal = Math.round((billedSubtotal + billedFee) * 100) / 100;
    const unusedRefund = Math.round((total - billedTotal) * 100) / 100;
    if (unusedRefund > 0) {
      await postTransaction(client, {
        type: "job_refund", referenceType: "job", referenceId: job.id,
        lines: [
          { accountId: platformEscrowId, amount: unusedRefund },
          { accountId: renterAccountId, amount: -unusedRefund },
        ],
        userBalanceDelta: { userId: job.user_id, amount: unusedRefund },
      });
    }
    const ownerId = (await client.query(`SELECT owner_id FROM nodes WHERE id = $1`, [job.node_id])).rows[0]?.owner_id;
    const platformRevenueId = await getPlatformAccountId(client, "platform_revenue");
    if (ownerId) {
      const ownerAccountId = await getUserAccountId(client, ownerId);
      settlementTxnId = await postTransaction(client, {
        type: "job_escrow_release", referenceType: "job", referenceId: job.id,
        lines: [
          { accountId: platformEscrowId, amount: billedTotal },
          { accountId: ownerAccountId, amount: -billedSubtotal },
          { accountId: platformRevenueId, amount: -billedFee },
        ],
        userBalanceDelta: { userId: ownerId, amount: billedSubtotal },
      });
    } else {
      settlementTxnId = await postTransaction(client, {
        type: "job_escrow_release", referenceType: "job", referenceId: job.id,
        lines: [
          { accountId: platformEscrowId, amount: billedTotal },
          { accountId: platformRevenueId, amount: -billedTotal },
        ],
      });
    }
  }

  await client.query(
    `UPDATE jobs SET status = $1, completed_at = COALESCE(completed_at, now()), settlement_transaction_id = $2,
       billed_subtotal_usd = $3, billed_fee_usd = $4, billed_total_usd = $5,
       settlement_state = $6 WHERE id = $7`,
    [status, settlementTxnId, billedSubtotal.toFixed(2), billedFee.toFixed(2), billedTotal.toFixed(2),
      status === "done" ? "released" : "refunded", job.id]
  );
  await refreshNodeReliability(client, job.node_id);
  await client.query(`DELETE FROM job_inputs WHERE job_id = $1`, [job.id]);
  return settlementTxnId;
}

export async function refreshNodeReliability(client, nodeId) {
  if (!nodeId) return;
  await client.query(`UPDATE nodes n SET reliability_score = stats.score FROM (
    SELECT CASE WHEN count(*) = 0 THEN 0.5
      ELSE (count(*) FILTER (WHERE status = 'done') + 2.0) / (count(*) + 4.0) END AS score
    FROM jobs WHERE node_id = $1 AND status IN ('done','failed')
      AND completed_at > now() - interval '30 days'
  ) stats WHERE n.id = $1`, [nodeId]);
}

export async function settleDeferredJobs() {
  if (incidentModeEnabled()) return;
  const { rows } = await query(`SELECT id FROM jobs
    WHERE status IN ('done','failed') AND settlement_state = 'held'
    ORDER BY completed_at ASC LIMIT 100`);
  for (const { id } of rows) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const job = (await client.query(`SELECT * FROM jobs WHERE id = $1 AND settlement_state = 'held' FOR UPDATE SKIP LOCKED`, [id])).rows[0];
      if (job) await settleJob(client, job, job.status);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`Deferred settlement ${id} failed:`, err.message);
    } finally { client.release(); }
  }
}
