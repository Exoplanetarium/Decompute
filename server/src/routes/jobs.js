import { Router } from "express";
import { pool, query } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { idempotent } from "../middleware/idempotency.js";
import { getUserAccountId, getPlatformAccountId, postTransaction } from "../lib/ledger.js";

export const jobsRouter = Router();

const MIN_HOURS = 1;
const MAX_HOURS = 72;
const SERVICE_FEE_RATE = 0.10;

function jobRowToApi(row) {
  return {
    id: row.id,
    name: row.name,
    node_name: row.node_name,
    status: row.status,
    started_at: row.started_at,
    estimated_cost: row.total_usd,
    actual_cost: row.status === "done" ? row.total_usd : null,
    avg_gpu_usage: null,
    statusMessage: null,
  };
}

jobsRouter.get("/", requireAuth, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const { rows } = await query(
    `SELECT j.*, n.name AS node_name FROM jobs j
     LEFT JOIN nodes n ON n.id = j.node_id
     WHERE j.user_id = $1 ORDER BY j.created_at DESC LIMIT $2`,
    [req.userId, limit]
  );
  res.json({ data: rows.map(jobRowToApi) });
});

// Creates a job and holds its full cost in escrow. Price is looked up from
// the server's own node catalog — a client-submitted price is never trusted.
// Runs as one DB transaction with the user's row locked, so two concurrent
// submissions can't both read a stale balance and both succeed.
jobsRouter.post("/", requireAuth, idempotent("jobs"), async (req, res) => {
  const nodeId = String(req.body?.nodeId || "");
  const maxRuntimeHours = Number(req.body?.maxRuntimeHours);
  const name = req.body?.name ? String(req.body.name).slice(0, 200) : null;

  if (!nodeId) return res.status(400).json({ error: "nodeId is required" });
  if (!Number.isFinite(maxRuntimeHours) || maxRuntimeHours < MIN_HOURS || maxRuntimeHours > MAX_HOURS) {
    return res.status(400).json({ error: `maxRuntimeHours must be between ${MIN_HOURS} and ${MAX_HOURS}` });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const nodeRes = await client.query(
      `SELECT id, name, price_per_hour, verification_status, last_verified_at FROM nodes WHERE id = $1 AND active`,
      [nodeId]
    );
    const node = nodeRes.rows[0];
    // FUTURE HOOK: re-verification at session start. A stricter flow would
    // check node.last_verified_at freshness here (e.g. reject/warn if it's
    // been more than N days since the seller's helper binary last confirmed
    // these specs) and could require a fresh pairing-code + helper re-run
    // tied to this job before matching proceeds — the same POST
    // /api/nodes/detect mechanism, just re-triggered from a "re-verify"
    // prompt instead of first registration. Not implemented this pass;
    // verification_status/last_verified_at exist so this can be added
    // without another migration.
    if (!node) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Node not found" });
    }

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
      `INSERT INTO jobs (user_id, node_id, name, price_per_hour, max_runtime_hours, subtotal_usd, fee_usd, total_usd)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [req.userId, node.id, name || `Rental on ${node.name}`, pricePerHour, maxRuntimeHours, subtotal, fee, total]
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
    res.status(201).json({ data: jobRowToApi({ ...job, node_name: node.name }) });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

jobsRouter.post("/:id/cancel", requireAuth, async (req, res) => {
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
