-- Jobs identify a platform-curated workload. docker_image remains as the
-- immutable execution snapshot, but is now resolved server-side rather than
-- accepted from a renter request.
ALTER TABLE jobs ADD COLUMN workload_id TEXT;

UPDATE jobs SET workload_id = CASE
  WHEN docker_image = 'decompute/image-gen:local' THEN 'image-generation'
  WHEN docker_image LIKE '%/llm-finetune:%' THEN 'llm-finetune'
  WHEN docker_image LIKE '%/classifier-trainer:%' THEN 'train-classifier'
  WHEN docker_image LIKE '%/whisper-transcribe:%' THEN 'transcribe-audio'
  WHEN docker_image LIKE '%/video-gen:%' THEN 'video-generation'
  ELSE NULL
END;

CREATE INDEX jobs_workload_idx ON jobs (workload_id);
