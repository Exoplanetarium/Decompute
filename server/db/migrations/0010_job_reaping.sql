-- Opt-in: a stuck job is always refunded automatically (see the reaper in
-- server/src/lib/jobReaper.js), but re-submitting it is a fresh charge, so
-- doing that without being asked defaults to off.
ALTER TABLE users
  ADD COLUMN auto_retry_failed_jobs BOOLEAN NOT NULL DEFAULT false;

-- retry_of_job_id/retry_count track an auto-retry's lineage back to the job
-- that got stuck, and cap how many times the reaper will keep trying before
-- leaving it for the renter to retry manually. failure_reason holds a
-- human-readable explanation for a reaped job (surfaced via jobRowToApi's
-- statusMessage) — job_logs exists but is scoped to container output, not
-- system-generated explanations.
ALTER TABLE jobs
  ADD COLUMN retry_of_job_id UUID REFERENCES jobs(id),
  ADD COLUMN retry_count     INT NOT NULL DEFAULT 0,
  ADD COLUMN failure_reason  TEXT;
CREATE INDEX jobs_retry_of_idx ON jobs (retry_of_job_id);
