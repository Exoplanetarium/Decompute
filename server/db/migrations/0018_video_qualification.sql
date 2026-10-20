-- Provider qualification reuses the project/task/attempt pipeline: canary
-- renders are dispatched to one pinned node through the real protocol, and
-- the server measures timing and quality itself. Qualification moves no money.
ALTER TABLE video_projects ADD COLUMN kind TEXT NOT NULL DEFAULT 'retail' CHECK (kind IN ('retail','qualification'));
ALTER TABLE video_projects ADD COLUMN pinned_node_id TEXT REFERENCES nodes(id);
ALTER TABLE video_projects DROP CONSTRAINT video_projects_price_micros_check;
ALTER TABLE video_projects ADD CONSTRAINT video_projects_kind_price_check CHECK (
  (kind = 'retail' AND price_micros > 0 AND pinned_node_id IS NULL)
  OR (kind = 'qualification' AND price_micros = 0 AND compute_cap_micros = 0 AND pinned_node_id IS NOT NULL));
CREATE INDEX video_qualification_projects ON video_projects(pinned_node_id, created_at) WHERE kind = 'qualification';

-- Round-robin processing: the queue sweeps the least recently processed
-- projects first, so a long-running batch cannot starve newer projects.
ALTER TABLE video_projects ADD COLUMN ticked_at TIMESTAMPTZ;
DROP INDEX video_active_projects;
CREATE INDEX video_active_projects ON video_projects(ticked_at NULLS FIRST, created_at) WHERE settled_at IS NULL;

-- A node's record is rebuilt from its most recent finished attempts.
CREATE INDEX video_attempts_node_history ON video_attempts(node_id, completed_at DESC) WHERE status IN ('done','failed');
