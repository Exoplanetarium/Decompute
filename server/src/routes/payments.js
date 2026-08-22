import { Router } from "express";
import "dotenv/config";
import { pool, query } from "../db.js";
import { stripe } from "../lib/stripe.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { idempotent } from "../middleware/idempotency.js";
import { getUserAccountId, getPlatformAccountId, postTransaction } from "../lib/ledger.js";

export const paymentsRouter = Router();

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
const MIN_TOPUP_USD = 5;
const MAX_TOPUP_USD = 10000;

paymentsRouter.post("/checkout-session", requireAuth, idempotent("checkout-session"), async (req, res) => {
  const amountUsd = Number(req.body?.amountUsd);
  if (!Number.isFinite(amountUsd) || amountUsd < MIN_TOPUP_USD || amountUsd > MAX_TOPUP_USD) {
    return res.status(400).json({ error: `Amount must be between $${MIN_TOPUP_USD} and $${MAX_TOPUP_USD}` });
  }

  const { rows } = await query(
    `INSERT INTO payment_intents (user_id, amount_usd) VALUES ($1, $2) RETURNING id`,
    [req.userId, amountUsd.toFixed(2)]
  );
  const paymentIntentId = rows[0].id;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [{
      price_data: {
        currency: "usd",
        product_data: { name: "Decompute balance top-up" },
        unit_amount: Math.round(amountUsd * 100),
      },
      quantity: 1,
    }],
    success_url: `${CLIENT_URL}/?topup=success&checkout_id=${paymentIntentId}`,
    cancel_url: `${CLIENT_URL}/?topup=cancel`,
    metadata: { userId: req.userId, paymentIntentId },
  });

  await query(
    `UPDATE payment_intents SET stripe_checkout_session_id = $1, updated_at = now() WHERE id = $2`,
    [session.id, paymentIntentId]
  );

  res.json({ url: session.url, checkoutSessionId: paymentIntentId });
});

paymentsRouter.get("/checkout-session/:id", requireAuth, async (req, res) => {
  const { rows } = await query(
    `SELECT id, amount_usd, status FROM payment_intents WHERE id = $1 AND user_id = $2`,
    [req.params.id, req.userId]
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json({ id: rows[0].id, amountUsd: rows[0].amount_usd, status: rows[0].status });
});

paymentsRouter.get("/history", requireAuth, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const { rows } = await query(
    `SELECT le.amount, lt.type, lt.created_at
     FROM ledger_entries le
     JOIN ledger_accounts la ON la.id = le.account_id
     JOIN ledger_transactions lt ON lt.id = le.transaction_id
     WHERE la.owner_type = 'user' AND la.user_id = $1
     ORDER BY le.created_at DESC LIMIT $2`,
    [req.userId, limit]
  );
  // The stored sign follows the internal debit/credit convention (see
  // routes below) — flip it here so callers see "positive = balance went up".
  res.json({ data: rows.map(r => ({ type: r.type, amount: -Number(r.amount), createdAt: r.created_at })) });
});

// Stripe webhook handler — deliberately NOT part of paymentsRouter. It must
// be mounted in index.js with express.raw() *before* the global
// express.json() middleware, since signature verification needs the exact
// bytes Stripe signed, not JSON re-serialized after parsing. This is the
// ONLY thing allowed to credit a user's balance for a top-up — the client's
// own checkout-session response or redirect is never trusted.
export async function stripeWebhookHandler(req, res) {
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Stripe delivers at-least-once; skip side effects if we've seen this event.
    const inserted = await client.query(
      `INSERT INTO stripe_webhook_events (id, type, payload) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
      [event.id, event.type, JSON.stringify(event)]
    );

    if (inserted.rowCount > 0 && event.type === "checkout.session.completed") {
      const session = event.data.object;
      const piRes = await client.query(
        `SELECT id, user_id, amount_usd, status FROM payment_intents WHERE stripe_checkout_session_id = $1 FOR UPDATE`,
        [session.id]
      );
      const pi = piRes.rows[0];

      if (pi && pi.status !== "succeeded") {
        const amount = Number(pi.amount_usd);
        const userAccountId = await getUserAccountId(client, pi.user_id);
        const platformCashId = await getPlatformAccountId(client, "platform_cash");

        // Debit/credit convention: platform_cash is a debit-normal asset
        // account (positive = cash held increases). `user` is a credit-normal
        // liability account (what we owe the user) — its ledger_entries sign
        // is the NEGATIVE of the real balance change; the real, intuitive
        // change is applied separately via userBalanceDelta.
        await postTransaction(client, {
          type: "topup_card",
          idempotencyKey: event.id,
          referenceType: "stripe_payment_intent",
          referenceId: pi.id,
          lines: [
            { accountId: platformCashId, amount },
            { accountId: userAccountId, amount: -amount },
          ],
          userBalanceDelta: { userId: pi.user_id, amount },
        });

        await client.query(
          `UPDATE payment_intents SET status = 'succeeded', updated_at = now() WHERE id = $1`,
          [pi.id]
        );
      }
    }

    await client.query("COMMIT");
    res.json({ received: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Webhook processing failed:", err);
    res.status(500).json({ error: "Webhook processing failed" });
  } finally {
    client.release();
  }
}
