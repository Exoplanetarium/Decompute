-- Minimal read-only node catalog, just enough for job pricing to be
-- verified server-side instead of trusted from the client. Seeded with the
-- same ids/prices the frontend's demo data uses (src/App.jsx DEMO_NODES) so
-- job submission works end-to-end before a real provider/listing backend
-- exists. A full GET /api/nodes + provider registration flow is separate,
-- larger work — not part of this pass.
CREATE TABLE nodes (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  gpu_model      TEXT NOT NULL,
  price_per_hour NUMERIC(12,2) NOT NULL,
  active         BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO nodes (id, name, gpu_model, price_per_hour) VALUES
  ('n1', 'Titan Cluster A7',    '8x NVIDIA H100 SXM',        12.80),
  ('n2', 'Apex Node Cluster',   '4x NVIDIA A100 80GB',         5.40),
  ('n3', 'Sovereign Pod',       '6x NVIDIA L40S',              4.20),
  ('n4', 'EdgeBurst X1',        '2x NVIDIA RTX 4090',          0.86),
  ('n5', 'NebulaCore',          '16x AMD MI300X',             28.60),
  ('n6', 'Helios Array',        '8x NVIDIA RTX 6000 Ada',      3.60);

ALTER TABLE jobs ADD COLUMN node_id TEXT REFERENCES nodes(id);
