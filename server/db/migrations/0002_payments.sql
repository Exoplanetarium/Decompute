-- Ledger accounts: one row per user (their spendable balance), plus three
-- platform singleton accounts. Every ledger_transaction's entries must net
-- to zero across whichever accounts it touches (enforced below).
CREATE TABLE ledger_accounts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type TEXT NOT NULL CHECK (owner_type IN ('user','platform_cash','platform_escrow','platform_revenue')),
  user_id    UUID REFERENCES users(id),       -- null for the three platform singleton accounts
  currency   TEXT NOT NULL DEFAULT 'usd',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_type, user_id, currency)
);

-- The three platform-wide accounts (one row each, no user_id).
INSERT INTO ledger_accounts (owner_type, currency) VALUES
  ('platform_cash', 'usd'),
  ('platform_escrow', 'usd'),
  ('platform_revenue', 'usd');

CREATE TABLE ledger_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type            TEXT NOT NULL CHECK (type IN
                    ('topup_card','job_escrow_hold','job_escrow_release','job_refund')),
  idempotency_key TEXT UNIQUE,        -- Stripe event id, or a caller-supplied Idempotency-Key
  reference_type  TEXT,               -- 'job' | 'stripe_payment_intent'
  reference_id    TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ledger_entries (
  id             BIGSERIAL PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES ledger_transactions(id),
  account_id     UUID NOT NULL REFERENCES ledger_accounts(id),
  amount         NUMERIC(14,2) NOT NULL,   -- positive = credit, negative = debit
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ledger_entries_account_idx ON ledger_entries (account_id, created_at);
CREATE INDEX ledger_entries_txn_idx ON ledger_entries (transaction_id);

-- Reject any transaction whose lines don't sum to zero, at commit time.
-- Belt-and-suspenders: application code (server/src/lib/ledger.js) also
-- validates this before insert, but a DB-level backstop survives app bugs.
CREATE OR REPLACE FUNCTION check_ledger_balance() RETURNS trigger AS $$
DECLARE total NUMERIC;
BEGIN
  SELECT SUM(amount) INTO total FROM ledger_entries WHERE transaction_id = NEW.transaction_id;
  IF total <> 0 THEN
    RAISE EXCEPTION 'ledger_transaction % does not balance (sum=%)', NEW.transaction_id, total;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER ledger_must_balance
  AFTER INSERT ON ledger_entries DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_ledger_balance();

CREATE TABLE payment_intents (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    UUID NOT NULL REFERENCES users(id),
  stripe_checkout_session_id TEXT UNIQUE,
  amount_usd                 NUMERIC(12,2) NOT NULL CHECK (amount_usd > 0),
  status                     TEXT NOT NULL DEFAULT 'created'
                               CHECK (status IN ('created','succeeded','failed','expired')),
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stripe delivers events at-least-once; this makes webhook processing idempotent.
CREATE TABLE stripe_webhook_events (
  id           TEXT PRIMARY KEY,      -- Stripe event.id
  type         TEXT NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload      JSONB NOT NULL
);

-- Per-user-per-route idempotency for client-initiated requests (mirrors the
-- one-time-use pattern wallet_nonces already established for wallet sign-in).
CREATE TABLE idempotency_keys (
  key             TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES users(id),
  route           TEXT NOT NULL,
  response_status INT,
  response_body   JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, route, key)
);

-- Minimal jobs table — enough to hang escrow on. price is snapshotted
-- server-side at creation time; a client-submitted price is never trusted.
CREATE TABLE jobs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id),
  name               TEXT,
  price_per_hour     NUMERIC(12,2) NOT NULL,
  max_runtime_hours  NUMERIC(6,2) NOT NULL,
  subtotal_usd       NUMERIC(12,2) NOT NULL,
  fee_usd            NUMERIC(12,2) NOT NULL,
  total_usd          NUMERIC(12,2) NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','running','done','failed','cancelled')),
  escrow_transaction_id     UUID REFERENCES ledger_transactions(id),
  settlement_transaction_id UUID REFERENCES ledger_transactions(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at       TIMESTAMPTZ
);
