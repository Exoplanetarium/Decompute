-- Real cash-out for sellers. balance_usdc up to now was purely internal
-- (renter top-ups in, node-owner earnings out via the ledger) — this adds
-- the Stripe Connect account a seller's earnings actually leave through.
ALTER TABLE users
  ADD COLUMN stripe_connect_account_id TEXT UNIQUE,
  ADD COLUMN connect_payouts_enabled   BOOLEAN NOT NULL DEFAULT false;

-- One row per withdrawal attempt. amount_usd is debited from the seller's
-- balance_usdc (via the ledger, same as every other balance change) at the
-- moment the Stripe transfer is created — 'paid' here means "transferred to
-- the seller's connected account", not "arrived in their bank", since the
-- connected account's own payout schedule is outside our control.
CREATE TABLE payouts (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES users(id),
  amount_usd             NUMERIC(12,2) NOT NULL CHECK (amount_usd > 0),
  stripe_transfer_id     TEXT UNIQUE,
  status                 TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid','failed')),
  settlement_transaction_id UUID REFERENCES ledger_transactions(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX payouts_user_idx ON payouts (user_id, created_at);

ALTER TABLE ledger_transactions DROP CONSTRAINT ledger_transactions_type_check;
ALTER TABLE ledger_transactions ADD CONSTRAINT ledger_transactions_type_check
  CHECK (type IN ('topup_card','job_escrow_hold','job_escrow_release','job_refund','seller_payout'));
