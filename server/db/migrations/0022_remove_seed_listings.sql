-- The six demo GPU servers from the marketplace era (0003_nodes.sql) aren't
-- real computers and don't belong on a volunteer docking network. Removed
-- the way a person removes their own computer (0020): hidden and inactive,
-- with the few old jobs that point at them left intact.
UPDATE nodes SET removed_at = now(), active = false, agent_token_hash = NULL
WHERE source = 'seed' AND removed_at IS NULL;
