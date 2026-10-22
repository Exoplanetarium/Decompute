-- A computer with work history can't be hard-deleted (jobs point at it), so
-- removing it hides it instead: removed_at set, active off, and its agent
-- token revoked so its helper can no longer check in.
ALTER TABLE nodes ADD COLUMN removed_at TIMESTAMPTZ;
