-- Short-lived, single-use codes that let the resident agent exchange a
-- typed-in code for its real credential, instead of a seller ever having to
-- copy/paste the long-lived secret itself. Modeled on pairing_codes
-- (0004_nodes_pairing.sql), but bound to an existing node rather than a
-- not-yet-created one.
CREATE TABLE agent_enroll_codes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT UNIQUE NOT NULL,
  node_id    TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','claimed','expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX agent_enroll_codes_node_idx ON agent_enroll_codes (node_id, created_at DESC);
