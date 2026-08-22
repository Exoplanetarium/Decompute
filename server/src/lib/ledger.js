// Shared helper for writing to the double-entry ledger. Every call must be
// made on a pg client that's already inside a transaction the caller owns
// (BEGIN/COMMIT) — this module never opens or closes transactions itself,
// since callers often need to lock other rows (e.g. `users` for a balance
// check) in the same transaction before deciding what to post.

// Upsert-and-return: creates the user's ledger account on first use,
// otherwise just returns its id (DO UPDATE is a no-op but makes RETURNING
// work on conflict, unlike DO NOTHING).
export async function getUserAccountId(client, userId) {
  const { rows } = await client.query(
    `INSERT INTO ledger_accounts (owner_type, user_id) VALUES ('user', $1)
     ON CONFLICT (owner_type, user_id, currency) DO UPDATE SET owner_type = EXCLUDED.owner_type
     RETURNING id`,
    [userId]
  );
  return rows[0].id;
}

// The three platform singleton accounts are seeded by migration 0002.
export async function getPlatformAccountId(client, ownerType) {
  const { rows } = await client.query(
    `SELECT id FROM ledger_accounts WHERE owner_type = $1 AND user_id IS NULL`,
    [ownerType]
  );
  if (!rows[0]) throw new Error(`Platform ledger account "${ownerType}" is not seeded`);
  return rows[0].id;
}

const toCents = (amount) => Math.round(Number(amount) * 100);

// Writes one ledger_transaction + its entries. `lines` must net to zero —
// checked here in integer cents (dollar floats can't be trusted to sum
// exactly to zero) as well as by the DB's own deferred constraint trigger.
// `userBalanceDelta`, when given, also updates the cached `users.balance_usdc`
// in the same transaction so reads never see the ledger and the cache disagree.
export async function postTransaction(client, {
  type,
  idempotencyKey = null,
  referenceType = null,
  referenceId = null,
  metadata = {},
  lines,
  userBalanceDelta = null,
}) {
  const centsTotal = lines.reduce((sum, l) => sum + toCents(l.amount), 0);
  if (centsTotal !== 0) {
    throw new Error(`Ledger transaction "${type}" does not balance (sum=${centsTotal} cents)`);
  }

  const { rows } = await client.query(
    `INSERT INTO ledger_transactions (type, idempotency_key, reference_type, reference_id, metadata)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [type, idempotencyKey, referenceType, referenceId, JSON.stringify(metadata)]
  );
  const transactionId = rows[0].id;

  for (const line of lines) {
    await client.query(
      `INSERT INTO ledger_entries (transaction_id, account_id, amount) VALUES ($1, $2, $3)`,
      [transactionId, line.accountId, line.amount.toFixed(2)]
    );
  }

  if (userBalanceDelta) {
    await client.query(
      `UPDATE users SET balance_usdc = balance_usdc + $1 WHERE id = $2`,
      [userBalanceDelta.amount.toFixed(2), userBalanceDelta.userId]
    );
  }

  return transactionId;
}
