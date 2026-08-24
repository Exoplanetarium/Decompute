-- Output channel for jobs that produce a file (e.g. a generated image)
-- rather than just text logs. One row per job for now — batching multiple
-- outputs per job isn't supported yet.
CREATE TABLE job_artifacts (
  id           BIGSERIAL PRIMARY KEY,
  job_id       UUID NOT NULL REFERENCES jobs(id),
  content_type TEXT NOT NULL,
  data         BYTEA NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX job_artifacts_job_idx ON job_artifacts (job_id);
