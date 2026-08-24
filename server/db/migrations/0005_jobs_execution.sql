-- Workload spec fields a job actually needs to run something (previously
-- only nodeId/maxRuntimeHours/name existed — nothing described what to
-- execute). docker_image stays nullable at the DB level; "must have a
-- workload" is an application-level rule enforced in POST /api/jobs,
-- matching how this codebase already validates business rules in route
-- handlers rather than blanket NOT NULL/CHECK constraints.
ALTER TABLE jobs
  ADD COLUMN docker_image  TEXT,
  ADD COLUMN gpus_needed   INT NOT NULL DEFAULT 1,
  ADD COLUMN min_vram_gb   NUMERIC(8,1) NOT NULL DEFAULT 0,
  ADD COLUMN env_vars      JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN started_at    TIMESTAMPTZ;

-- Matches the shape LiveJobView already expects from
-- GET /api/jobs/:id/heartbeats. No is_anomaly column — no anomaly
-- detection this pass, and the field is confirmed dead in the frontend
-- already (parsed, never rendered).
CREATE TABLE job_heartbeats (
  id            BIGSERIAL PRIMARY KEY,
  job_id        UUID NOT NULL REFERENCES jobs(id),
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  gpu_usage_pct NUMERIC(5,2),
  vram_used_gb  NUMERIC(8,2)
);
CREATE INDEX job_heartbeats_job_idx ON job_heartbeats (job_id, recorded_at);

-- Matches the {ts, t, msg} shape LiveJobView's Logs panel already renders
-- (t -> level here).
CREATE TABLE job_logs (
  id      BIGSERIAL PRIMARY KEY,
  job_id  UUID NOT NULL REFERENCES jobs(id),
  ts      TIMESTAMPTZ NOT NULL DEFAULT now(),
  level   TEXT NOT NULL DEFAULT 'INFO' CHECK (level IN ('INFO','WARN','ERROR','DEBUG')),
  msg     TEXT NOT NULL
);
CREATE INDEX job_logs_job_idx ON job_logs (job_id, id);
