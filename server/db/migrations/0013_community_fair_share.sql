-- Every job remains auditable as community supplied. Adding another source
-- later requires an explicit schema/code change; it cannot happen as a silent
-- fallback hidden behind the scheduler.
ALTER TABLE jobs
  ADD COLUMN execution_source TEXT NOT NULL DEFAULT 'community'
  CHECK (execution_source IN ('community'));

-- Fair-share state: providers who have waited longer and earned less recently
-- get priority while they are online. This is updated transactionally whenever
-- a job is assigned, so failed booking attempts do not consume a provider turn.
ALTER TABLE nodes ADD COLUMN last_job_assigned_at TIMESTAMPTZ;

CREATE INDEX nodes_fair_assignment_idx
  ON nodes (last_job_assigned_at ASC) WHERE active;

CREATE INDEX nodes_owner_assignment_idx
  ON nodes (owner_id, last_job_assigned_at DESC) WHERE owner_id IS NOT NULL;

CREATE INDEX jobs_node_completed_idx
  ON jobs (node_id, completed_at DESC) WHERE status = 'done';
