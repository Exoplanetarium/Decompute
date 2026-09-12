-- Raw renter inputs are deleted when a job reaches a terminal outcome.
-- Results have a short retrieval window instead of remaining in the primary
-- database forever; hashes and validation metadata remain for dispute audits.
ALTER TABLE job_artifacts
  ADD COLUMN expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '7 days';
CREATE INDEX job_artifacts_expiry_idx ON job_artifacts (expires_at);
