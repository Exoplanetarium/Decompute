-- Fixes up the placeholder `nodes` table (0003_nodes.sql) with real columns
-- for provider-registered listings, and adds pairing_codes to bind a
-- seller's detected hardware (reported by the unauthenticated Go helper
-- binary) back to their logged-in account.
--
-- nodes.id stays TEXT: changing it to UUID would require migrating the
-- live jobs.node_id TEXT FK and would break the 6 seed rows below, which
-- job purchase still depends on. New rows get an unguessable id via
-- gen_random_uuid()::text instead of continuing "n7","n8"...

ALTER TABLE nodes ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

ALTER TABLE nodes
  ADD COLUMN owner_id            UUID REFERENCES users(id),
  ADD COLUMN gpu_vendor          TEXT,
  ADD COLUMN gpu_count           INT NOT NULL DEFAULT 1,
  ADD COLUMN vram_gb             NUMERIC(8,1),
  ADD COLUMN ram_gb              NUMERIC(8,1),
  ADD COLUMN cpu_model           TEXT,
  ADD COLUMN cpu_cores           INT,
  ADD COLUMN os                  TEXT CHECK (os IN ('mac','windows','linux')),
  ADD COLUMN schedule            TEXT NOT NULL DEFAULT 'always' CHECK (schedule IN ('always','nights','idle')),
  ADD COLUMN renewable           BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN source              TEXT NOT NULL DEFAULT 'seed' CHECK (source IN ('seed','helper')),
  ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified','verified','mismatch')),
  ADD COLUMN last_verified_at    TIMESTAMPTZ,
  ADD COLUMN created_at          TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX nodes_owner_idx ON nodes (owner_id) WHERE owner_id IS NOT NULL;

-- Short-lived, single-use codes binding a seller's browser session to the
-- unauthenticated helper binary running on their machine. Modeled on
-- wallet_nonces (0001_init.sql) and idempotency_keys (0002_payments.sql).
CREATE TABLE pairing_codes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT UNIQUE NOT NULL,
  user_id       UUID NOT NULL REFERENCES users(id),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','detected','claimed','expired')),
  detected_spec JSONB,
  detected_at   TIMESTAMPTZ,
  node_id       TEXT REFERENCES nodes(id),
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pairing_codes_user_idx ON pairing_codes (user_id, created_at DESC);
