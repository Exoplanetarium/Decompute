-- Verifiable execution metadata and capability-aware community scheduling.
-- Escrow stays held until a validated result is settled; during incident
-- mode completed work can safely wait for later reconciliation.
ALTER TABLE nodes
  ADD COLUMN cached_models JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN gpu_benchmark_score NUMERIC(14,2),
  ADD COLUMN network_download_mbps NUMERIC(12,2),
  ADD COLUMN network_upload_mbps NUMERIC(12,2),
  ADD COLUMN benchmark_version TEXT,
  ADD COLUMN capabilities_reported_at TIMESTAMPTZ,
  ADD COLUMN reliability_score NUMERIC(5,4) NOT NULL DEFAULT 0.5000
    CHECK (reliability_score >= 0 AND reliability_score <= 1);

ALTER TABLE jobs
  ADD COLUMN deterministic_seed BIGINT,
  ADD COLUMN manifest_version INT NOT NULL DEFAULT 1,
  ADD COLUMN manifest_hash TEXT,
  ADD COLUMN input_hash TEXT,
  ADD COLUMN model_id TEXT,
  ADD COLUMN result_schema TEXT,
  ADD COLUMN result_validated BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN result_hash TEXT,
  ADD COLUMN result_metadata JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN settlement_state TEXT NOT NULL DEFAULT 'held'
    CHECK (settlement_state IN ('held','released','refunded')),
  ADD COLUMN escrow_expires_at TIMESTAMPTZ;

UPDATE jobs SET settlement_state = CASE
  WHEN status = 'done' THEN 'released'
  WHEN status IN ('failed','cancelled') THEN 'refunded'
  ELSE 'held'
END;

CREATE TABLE job_inputs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id),
  job_id       UUID REFERENCES jobs(id),
  filename     TEXT NOT NULL,
  content_type TEXT NOT NULL,
  sha256       TEXT NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  byte_size    INT NOT NULL CHECK (byte_size > 0 AND byte_size <= 26214400),
  data         BYTEA NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT now() + interval '1 hour'
);
CREATE INDEX job_inputs_unclaimed_idx ON job_inputs (user_id, expires_at) WHERE job_id IS NULL;
CREATE INDEX job_inputs_job_idx ON job_inputs (job_id);

ALTER TABLE job_artifacts
  ADD COLUMN sha256 TEXT,
  ADD COLUMN byte_size INT,
  ADD COLUMN validated BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN validation_metadata JSONB NOT NULL DEFAULT '{}';

CREATE INDEX nodes_capability_schedule_idx
  ON nodes (reliability_score DESC, gpu_benchmark_score DESC, network_download_mbps DESC)
  WHERE active;
CREATE INDEX jobs_held_escrow_idx
  ON jobs (completed_at) WHERE settlement_state = 'held';
