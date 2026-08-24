-- Persistent agent credential + liveness, distinct from the short-lived,
-- single-use pairing_codes (wrong shape for a process that runs
-- indefinitely). agent_token_hash stores bcrypt(secret); the token shown
-- to the seller once is "<node.id>.<secret>" so the node id doubles as an
-- indexed lookup key without a separate table.
ALTER TABLE nodes
  ADD COLUMN agent_token_hash TEXT,
  ADD COLUMN last_seen_at     TIMESTAMPTZ;

CREATE INDEX nodes_last_seen_idx ON nodes (last_seen_at) WHERE agent_token_hash IS NOT NULL;
