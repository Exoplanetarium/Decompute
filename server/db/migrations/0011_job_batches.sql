-- A "batch" is just a jobs row with children pointing back at it via
-- parent_job_id — not a separate table, because a parent needs none of its
-- own execution state (no node, no Docker image run, no escrow of its
-- own — every dollar lives on a child). Every child is a completely
-- ordinary job: matched, escrowed, executed, settled, and reaped exactly
-- like any standalone job today, so none of that logic has to be
-- duplicated or made batch-aware. A parent's status/cost/progress are
-- always derived by aggregating its children on read, never stored, the
-- same way a node's online/offline "status" is computed on read rather
-- than cached.
ALTER TABLE jobs
  ADD COLUMN parent_job_id UUID REFERENCES jobs(id);
CREATE INDEX jobs_parent_idx ON jobs (parent_job_id);
