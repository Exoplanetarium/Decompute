-- Video retail escrow is separate from provider attempts. Keep sub-cent
-- earnings exact; existing job/card flows continue posting whole cents.
ALTER TABLE users ALTER COLUMN balance_usdc TYPE NUMERIC(18,6);
ALTER TABLE ledger_entries ALTER COLUMN amount TYPE NUMERIC(18,6);

CREATE TABLE video_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  request_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  prompt TEXT NOT NULL,
  duration_seconds INT NOT NULL CHECK (duration_seconds IN (5,15,30)),
  style TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN
    ('queued','planning','rendering','assembling','done','failed','cancelled')),
  plan JSONB,
  quote JSONB NOT NULL,
  price_micros BIGINT NOT NULL CHECK (price_micros > 0),
  compute_cap_micros BIGINT NOT NULL CHECK (compute_cap_micros >= 0),
  spent_micros BIGINT NOT NULL DEFAULT 0 CHECK (spent_micros >= 0),
  reserved_micros BIGINT NOT NULL DEFAULT 0 CHECK (reserved_micros >= 0),
  model_api_micros BIGINT NOT NULL DEFAULT 0,
  final_asset_id UUID,
  failure_reason TEXT,
  settled_at TIMESTAMPTZ,
  lease_token UUID,
  lease_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '2 hours',
  completed_at TIMESTAMPTZ,
  UNIQUE (user_id, request_key),
  CHECK (spent_micros + reserved_micros <= compute_cap_micros)
);

CREATE TABLE video_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES video_projects(id),
  task_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('reference','storyboard','shot')),
  shot_index INT,
  spec JSONB NOT NULL,
  dependencies TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','assigned','review','done','failed','cancelled')),
  attempt_count INT NOT NULL DEFAULT 0,
  creative_revision INT NOT NULL DEFAULT 0,
  active_attempt_id UUID,
  output_asset_id UUID,
  failure_reason TEXT,
  UNIQUE (project_id, task_key)
);

CREATE TABLE video_qualifications (
  node_id TEXT NOT NULL REFERENCES nodes(id),
  preset_id TEXT NOT NULL,
  image_digest TEXT NOT NULL,
  model_revision TEXT NOT NULL,
  p50_seconds NUMERIC NOT NULL CHECK (p50_seconds > 0),
  p95_seconds NUMERIC NOT NULL CHECK (p95_seconds >= p50_seconds),
  acceptance NUMERIC NOT NULL CHECK (acceptance > 0 AND acceptance <= 1),
  samples INT NOT NULL CHECK (samples >= 20),
  report_hash TEXT NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '14 days',
  PRIMARY KEY (node_id, preset_id)
);

CREATE TABLE video_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES video_tasks(id),
  project_id UUID NOT NULL REFERENCES video_projects(id),
  node_id TEXT NOT NULL REFERENCES nodes(id),
  owner_id UUID NOT NULL REFERENCES users(id),
  attempt_number INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','review','done','failed','cancelled')),
  manifest_spec JSONB NOT NULL,
  hourly_micros BIGINT NOT NULL CHECK (hourly_micros >= 0),
  reserved_micros BIGINT NOT NULL CHECK (reserved_micros >= 0),
  paid_micros BIGINT NOT NULL DEFAULT 0,
  max_seconds INT NOT NULL CHECK (max_seconds > 0),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deadline_at TIMESTAMPTZ NOT NULL,
  asset_id UUID,
  result_metadata JSONB,
  failure_reason TEXT,
  settled_at TIMESTAMPTZ,
  UNIQUE (task_id, attempt_number)
);
CREATE UNIQUE INDEX video_one_attempt_per_node ON video_attempts(node_id) WHERE status IN ('pending','running');
CREATE INDEX video_active_projects ON video_projects(created_at) WHERE settled_at IS NULL;
CREATE INDEX video_tasks_project ON video_tasks(project_id, status);
CREATE INDEX video_attempts_project ON video_attempts(project_id, status);

CREATE TABLE video_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES video_projects(id),
  attempt_id UUID REFERENCES video_attempts(id),
  storage_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  byte_size BIGINT NOT NULL CHECK (byte_size > 0),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '7 days'
);
CREATE UNIQUE INDEX video_one_artifact_per_attempt ON video_assets(attempt_id) WHERE attempt_id IS NOT NULL;
