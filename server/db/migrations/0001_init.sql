CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE,
  password_hash TEXT,
  wallet        TEXT UNIQUE,
  display_name  TEXT,
  role          TEXT NOT NULL DEFAULT 'renter',
  balance_usdc  NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_has_identity CHECK (email IS NOT NULL OR wallet IS NOT NULL)
);

-- One-time nonces issued for wallet sign-in, consumed on verification.
CREATE TABLE IF NOT EXISTS wallet_nonces (
  wallet     TEXT PRIMARY KEY,
  nonce      TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
