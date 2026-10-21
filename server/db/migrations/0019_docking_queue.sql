-- Docking screens run as a work queue instead of being split across nodes up
-- front. A screen is a parent job that holds the renter's escrow; its chunks
-- are child jobs created with no node, claimed one at a time by whichever
-- computer is free (see server/src/lib/dockingScreen.js).

-- On a screen (parent): the per-molecule rate it was priced at.
ALTER TABLE jobs ADD COLUMN price_per_unit_usd NUMERIC(12,6);

-- On a chunk (child): how many molecules it carries, and the nodes that
-- already failed it, so a requeued chunk goes to a different computer.
ALTER TABLE jobs ADD COLUMN unit_count INTEGER CHECK (unit_count IS NULL OR unit_count > 0);
ALTER TABLE jobs ADD COLUMN excluded_node_ids TEXT[] NOT NULL DEFAULT '{}';
-- created_at says nothing about a chunk that waited an hour in the queue, so
-- the reaper times chunks from these instead: when a node was handed it, and
-- when it last went back into the queue after a failure.
ALTER TABLE jobs ADD COLUMN assigned_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN requeued_at TIMESTAMPTZ;

-- The next chunk to hand out: oldest first, unassigned, still pending.
CREATE INDEX jobs_queued_chunks_idx ON jobs (created_at, id)
  WHERE status = 'pending' AND node_id IS NULL AND unit_count IS NOT NULL;
