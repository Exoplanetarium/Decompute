import { getUserAccountId, getPlatformAccountId } from "../ledger.js";

// The existing card/job ledger posts cents. Video provider earnings need
// integer microdollars to avoid rounding a small completed task to zero.
export async function transferMicros(client, { from, to, micros, type, referenceId, key }) {
  if (!Number.isSafeInteger(micros) || micros < 0) throw new Error("Invalid video ledger amount");
  if (micros === 0) return;
  const account = (owner) => owner.userId ? getUserAccountId(client, owner.userId) : getPlatformAccountId(client, owner.platform);
  const fromId = await account(from), toId = await account(to);
  const result = await client.query(`INSERT INTO ledger_transactions
    (type, idempotency_key, reference_type, reference_id) VALUES ($1,$2,'video_project',$3)
    ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`, [type, key, referenceId]);
  if (!result.rows[0]) return;
  const amount = (micros / 1_000_000).toFixed(6);
  await client.query(`INSERT INTO ledger_entries (transaction_id, account_id, amount) VALUES ($1,$2,$4),($1,$3,-$4::numeric)`,
    [result.rows[0].id, fromId, toId, amount]);
  // Both sides here are credit-normal liabilities/revenue, never cash.
  if (from.userId) await client.query(`UPDATE users SET balance_usdc = balance_usdc - $1 WHERE id = $2`, [amount, from.userId]);
  if (to.userId) await client.query(`UPDATE users SET balance_usdc = balance_usdc + $1 WHERE id = $2`, [amount, to.userId]);
}
