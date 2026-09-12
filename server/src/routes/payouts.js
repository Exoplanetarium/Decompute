import { Router } from "express";
import { incidentModeEnabled } from "../lib/incidentMode.js";
import "dotenv/config";
import { pool, query } from "../db.js";
import { stripe } from "../lib/stripe.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { idempotent } from "../middleware/idempotency.js";
import { getUserAccountId, getPlatformAccountId, postTransaction } from "../lib/ledger.js";

export const payoutsRouter = Router();

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
const MIN_WITHDRAWAL_USD = 1;

// Creates (once) the seller's Stripe Connect Express account, then always
// mints a fresh onboarding link — account links expire after a few minutes,
// so nothing about the URL itself is worth caching.
payoutsRouter.post("/connect-onboard", requireAuth, async (req, res) => {
  const { rows } = await query(`SELECT email, stripe_connect_account_id FROM users WHERE id = $1`, [req.userId]);
  const user = rows[0];

  let accountId = user.stripe_connect_account_id;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      email: user.email || undefined,
      capabilities: { transfers: { requested: true } },
    });
    accountId = account.id;
    await query(`UPDATE users SET stripe_connect_account_id = $1 WHERE id = $2`, [accountId, req.userId]);
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${CLIENT_URL}/?connect=refresh`,
    return_url: `${CLIENT_URL}/?connect=return`,
    type: "account_onboarding",
  });

  res.json({ url: link.url });
});

// Polled when the payouts panel loads and after the seller returns from
// Stripe's onboarding flow. payouts_enabled is Stripe's own answer to "can
// this account actually receive transfers yet" — cached on the user row
// once true (it doesn't go back to false), so most loads skip the API call.
payoutsRouter.get("/status", requireAuth, async (req, res) => {
  const { rows } = await query(
    `SELECT stripe_connect_account_id, connect_payouts_enabled, balance_usdc FROM users WHERE id = $1`,
    [req.userId]
  );
  const user = rows[0];

  let payoutsEnabled = user.connect_payouts_enabled;
  if (user.stripe_connect_account_id && !payoutsEnabled) {
    const account = await stripe.accounts.retrieve(user.stripe_connect_account_id);
    payoutsEnabled = !!account.payouts_enabled;
    if (payoutsEnabled) {
      await query(`UPDATE users SET connect_payouts_enabled = true WHERE id = $1`, [req.userId]);
    }
  }

  res.json({
    data: {
      connected: !!user.stripe_connect_account_id,
      payoutsEnabled,
      balanceUsdc: user.balance_usdc,
    },
  });
});

payoutsRouter.get("/history", requireAuth, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const { rows } = await query(
    `SELECT id, amount_usd, status, created_at FROM payouts WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [req.userId, limit]
  );
  res.json({ data: rows });
});

// Withdraws the seller's whole available balance to their connected Stripe
// account. Whole-balance, not a client-supplied amount: balance_usdc is
// purely earnings with no separate spendable/withdrawable split, so there's
// nothing to hold back and no client-submitted number to distrust. Row is
// locked for the balance read + Stripe call + ledger debit so a second
// concurrent withdraw (or a job being escrowed at the same moment) can't
// race the balance this reads.
payoutsRouter.post("/withdraw", requireAuth, idempotent("payouts-withdraw"), async (req, res) => {
  if (incidentModeEnabled()) return res.status(503).json({ error: "Withdrawals are temporarily paused while the network is in incident mode" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT balance_usdc, stripe_connect_account_id, connect_payouts_enabled FROM users WHERE id = $1 FOR UPDATE`,
      [req.userId]
    );
    const user = rows[0];
    const amount = Number(user.balance_usdc);

    if (!user.stripe_connect_account_id || !user.connect_payouts_enabled) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Connect a payout account before withdrawing." });
    }
    if (!(amount >= MIN_WITHDRAWAL_USD)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: `Balance must be at least $${MIN_WITHDRAWAL_USD} to withdraw.` });
    }

    let transfer;
    try {
      transfer = await stripe.transfers.create({
        amount: Math.round(amount * 100),
        currency: "usd",
        destination: user.stripe_connect_account_id,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      return res.status(502).json({ error: `Payout failed: ${err.message}` });
    }

    const userAccountId = await getUserAccountId(client, req.userId);
    const platformCashId = await getPlatformAccountId(client, "platform_cash");

    // Debit/credit convention (see server/src/lib/ledger.js): platform_cash
    // is debit-normal (cash leaving records as negative), user is
    // credit-normal (their ledger sign is the negative of the real balance
    // change, applied separately via userBalanceDelta).
    const txnId = await postTransaction(client, {
      type: "seller_payout",
      referenceType: "stripe_transfer",
      referenceId: transfer.id,
      lines: [
        { accountId: platformCashId, amount: -amount },
        { accountId: userAccountId, amount },
      ],
      userBalanceDelta: { userId: req.userId, amount: -amount },
    });

    await client.query(
      `INSERT INTO payouts (user_id, amount_usd, stripe_transfer_id, status, settlement_transaction_id)
       VALUES ($1, $2, $3, 'paid', $4)`,
      [req.userId, amount.toFixed(2), transfer.id, txnId]
    );

    await client.query("COMMIT");
    res.json({ data: { amountUsd: amount, stripeTransferId: transfer.id } });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});
