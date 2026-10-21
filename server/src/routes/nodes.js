import { Router } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { pool, query } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { idempotent } from "../middleware/idempotency.js";

export const nodesRouter = Router();

const PAIRING_CODE_TTL_MINUTES = 15;
const PRICE_MIN = 0.05;
const PRICE_MAX = 100;
const SCHEDULES = ["always", "nights", "idle"];
const OSES = ["mac", "windows", "linux"];

// POST /detect is called by the unauthenticated helper binary running on a
// seller's machine — no JWT exists there. A short pairing code plus a
// tighter rate limit than the rest of the router is the only guard.
export const detectLimiter = rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false });

function inRange(n, min, max) {
  return Number.isFinite(n) && n >= min && n <= max;
}

function nodeRowToApi(row) {
  return {
    id: row.id,
    name: row.name,
    gpu_model: row.gpu_model,
    gpu_vendor: row.gpu_vendor,
    gpu_count: row.gpu_count,
    vram_gb: row.vram_gb,
    ram_gb: row.ram_gb,
    cpu_model: row.cpu_model,
    cpu_cores: row.cpu_cores,
    os: row.os,
    price_per_hour: row.price_per_hour,
    active: row.active,
    schedule: row.schedule,
    renewable: row.renewable,
    source: row.source,
    verification_status: row.verification_status,
    status: row.status,
    cached_models: row.cached_models || [],
    gpu_benchmark_score: row.gpu_benchmark_score,
    network_download_mbps: row.network_download_mbps,
    network_upload_mbps: row.network_upload_mbps,
    reliability_score: row.reliability_score,
    capabilities_reported_at: row.capabilities_reported_at,
  };
}

// A node's status must reflect whether its agent is actually heartbeating
// right now, not just the static `active` flag — otherwise a node whose
// agent crashed (or a seed/demo row that never had one) still shows as
// rentable and jobs sent to it would sit unclaimed forever.
const STATUS_SELECT = `
  n.*,
  CASE
    WHEN n.agent_token_hash IS NULL OR n.last_seen_at IS NULL
      OR n.last_seen_at < now() - interval '90 seconds' THEN 'offline'
    WHEN EXISTS (
      SELECT 1 FROM jobs j WHERE j.node_id = n.id AND j.status IN ('pending', 'running')
    ) THEN 'busy'
    ELSE 'available'
  END AS status
`;

nodesRouter.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const { rows } = await query(
    `SELECT ${STATUS_SELECT} FROM nodes n WHERE n.active = true ORDER BY n.created_at DESC LIMIT $1`,
    [limit]
  );
  res.json({ data: rows.map(nodeRowToApi) });
});

// The caller's own listings, including paused ones (which GET / hides).
// Declared before any /:id route so the literal path always wins.
nodesRouter.get("/mine", requireAuth, async (req, res) => {
  const { rows } = await query(
    `SELECT ${STATUS_SELECT} FROM nodes n WHERE n.owner_id = $1 ORDER BY n.created_at DESC`,
    [req.userId]
  );
  res.json({ data: rows.map(nodeRowToApi) });
});

// Mints a short-lived, single-use code that binds the browser's logged-in
// session to whatever machine later runs the helper binary with this code.
nodesRouter.post("/pairing-codes", requireAuth, idempotent("nodes-pairing-codes"), async (req, res) => {
  await query(
    `UPDATE pairing_codes SET status = 'expired' WHERE user_id = $1 AND status = 'pending'`,
    [req.userId]
  );

  const code = crypto.randomBytes(4).toString("hex").toUpperCase();
  const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MINUTES * 60_000);
  await query(
    `INSERT INTO pairing_codes (code, user_id, expires_at) VALUES ($1, $2, $3)`,
    [code, req.userId, expiresAt]
  );

  res.status(201).json({ data: { code, expiresAt } });
});

// Polled by the browser while waiting for the seller to run the helper.
// Scoped to user_id so a code can't be used to probe another account —
// a mismatch 404s exactly like a nonexistent code.
nodesRouter.get("/pairing-codes/:code", requireAuth, async (req, res) => {
  const code = String(req.params.code || "").toUpperCase();
  const { rows } = await query(
    `SELECT status, detected_spec, expires_at, node_id FROM pairing_codes WHERE code = $1 AND user_id = $2`,
    [code, req.userId]
  );
  const row = rows[0];
  if (!row) return res.status(404).json({ error: "Not found" });

  let status = row.status;
  if (status === "pending" && new Date(row.expires_at) < new Date()) {
    await query(`UPDATE pairing_codes SET status = 'expired' WHERE code = $1`, [code]);
    status = "expired";
  }

  res.json({ data: { status, detectedSpec: row.detected_spec, expiresAt: row.expires_at, nodeId: row.node_id } });
});

// Called by the helper binary, not the browser — no auth. Only ever writes
// to the pairing_codes row the code identifies; never resolves or reveals
// which user that is.
// Validates a helper's hardware report (POST /detect and POST /setup).
function parseDetectedSpec(body) {
  const os = String(body?.os || "");
  const hostname = body?.hostname ? String(body.hostname).slice(0, 200) : null;
  const gpu = body?.gpu || {};
  const ram = body?.ram || {};
  const cpu = body?.cpu || {};

  const gpuVendor = gpu.vendor ? String(gpu.vendor).slice(0, 50) : null;
  const gpuModel = String(gpu.model || "Unknown").slice(0, 200);
  const gpuCount = Number(gpu.count);
  const vramGb = Number(gpu.vramGb);
  const ramGb = Number(ram.totalGb);
  const cpuModel = cpu.model ? String(cpu.model).slice(0, 200) : null;
  const cpuCores = Number(cpu.cores);

  if (!OSES.includes(os)) return { error: "Invalid os" };
  // 0 is a CPU-only computer, which can still take docking work.
  if (!inRange(gpuCount, 0, 16)) return { error: "Invalid gpu.count" };
  if (!inRange(vramGb, 0, 256)) return { error: "Invalid gpu.vramGb" };
  if (!inRange(ramGb, 0, 2048)) return { error: "Invalid ram.totalGb" };
  if (!inRange(cpuCores, 1, 256)) return { error: "Invalid cpu.cores" };

  // Local prerequisite checks (NVIDIA driver, Docker, GPU container access)
  // reported by the same helper run — sanitized to plain booleans/short
  // strings, never trusted for anything beyond display back in the browser.
  // Older helper builds don't send this at all — omit the field rather than
  // recording a false "nothing is ready" result with no checks to show for it.
  const rawChecks = Array.isArray(body?.readiness?.checks) ? body.readiness.checks : [];
  const readinessChecks = rawChecks.slice(0, 10).map((check) => ({
    id: String(check?.id || "").slice(0, 50),
    label: String(check?.label || "").slice(0, 100),
    ready: !!check?.ready,
    detail: String(check?.detail || "").slice(0, 300),
    install: String(check?.install || "").slice(0, 300),
  }));
  const readiness = readinessChecks.length > 0 ? { ready: !!body?.readiness?.ready, checks: readinessChecks } : null;

  return { spec: { os, hostname, gpuVendor, gpuModel, gpuCount, vramGb, ramGb, cpuModel, cpuCores, readiness } };
}

nodesRouter.post("/detect", detectLimiter, async (req, res) => {
  const code = String(req.body?.code || "").toUpperCase();
  const parsed = parseDetectedSpec(req.body);
  if (!code) return res.status(400).json({ error: "code is required" });
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const detectedSpec = parsed.spec;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT id FROM pairing_codes WHERE code = $1 AND status = 'pending' AND expires_at > now() FOR UPDATE`,
      [code]
    );
    if (!rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Invalid or expired pairing code" });
    }

    await client.query(
      `UPDATE pairing_codes SET status = 'detected', detected_spec = $1, detected_at = now() WHERE code = $2`,
      [JSON.stringify(detectedSpec), code]
    );

    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

// One-command setup for the helper container (`--setup CODE`): the same
// pairing code the browser minted, but the helper's own hardware report
// registers the computer immediately and returns its agent credential, so a
// volunteer pastes one command instead of pairing, naming, and starting in
// three steps. Named "Computer N" for its owner; hardware still comes only
// from the helper's report, never from the browser.
nodesRouter.post("/setup", detectLimiter, async (req, res) => {
  const code = String(req.body?.code || "").toUpperCase();
  if (!code) return res.status(400).json({ error: "code is required" });
  const parsed = parseDetectedSpec(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const spec = parsed.spec;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT id, user_id FROM pairing_codes WHERE code = $1 AND status = 'pending' AND expires_at > now() FOR UPDATE`,
      [code]
    );
    const pairing = rows[0];
    if (!pairing) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Invalid or expired pairing code" });
    }

    // Not ready (e.g. Docker not running): record the report so the browser
    // can show what to fix, and leave the code usable for a retry.
    if (spec.readiness && spec.readiness.ready === false) {
      await client.query(
        `UPDATE pairing_codes SET detected_spec = $1, detected_at = now() WHERE id = $2`,
        [JSON.stringify(spec), pairing.id]
      );
      await client.query("COMMIT");
      return res.status(409).json({ error: "This computer isn't ready yet", checks: spec.readiness.checks });
    }

    const { rows: [{ n }] } = await client.query(`SELECT count(*)::int AS n FROM nodes WHERE owner_id = $1`, [pairing.user_id]);
    const agentSecret = crypto.randomBytes(32).toString("hex");
    const agentTokenHash = await bcrypt.hash(agentSecret, 12);
    const { rows: [node] } = await client.query(
      `INSERT INTO nodes (
         owner_id, name, gpu_model, gpu_vendor, gpu_count, vram_gb, ram_gb,
         cpu_model, cpu_cores, os, price_per_hour, active, schedule, renewable,
         source, verification_status, last_verified_at, agent_token_hash
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0.5,true,'always',false,'helper','verified',now(),$11)
       RETURNING id, name`,
      [pairing.user_id, `Computer ${n + 1}`, spec.gpuModel, spec.gpuVendor, spec.gpuCount, spec.vramGb, spec.ramGb,
        spec.cpuModel, spec.cpuCores, spec.os, agentTokenHash]
    );
    await client.query(
      `UPDATE pairing_codes SET status = 'claimed', node_id = $1, detected_spec = $2, detected_at = now() WHERE id = $3`,
      [node.id, JSON.stringify(spec), pairing.id]
    );
    await client.query("COMMIT");
    res.status(201).json({ data: { nodeId: node.id, name: node.name, agentToken: `${node.id}.${agentSecret}` } });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

// Finalizes the listing. Every hardware field is read from the pairing
// code's detected_spec (written only by POST /detect) — never from this
// request body — so a seller can't just type in specs.
nodesRouter.post("/", requireAuth, idempotent("nodes"), async (req, res) => {
  const code = String(req.body?.code || "").toUpperCase();
  const name = req.body?.name ? String(req.body.name).slice(0, 100) : null;
  const pricePerHour = Number(req.body?.pricePerHour);
  const schedule = String(req.body?.schedule || "always");
  const renewable = !!req.body?.renewable;

  if (!code) return res.status(400).json({ error: "code is required" });
  if (!name) return res.status(400).json({ error: "name is required" });
  if (!inRange(pricePerHour, PRICE_MIN, PRICE_MAX)) {
    return res.status(400).json({ error: `pricePerHour must be between ${PRICE_MIN} and ${PRICE_MAX}` });
  }
  if (!SCHEDULES.includes(schedule)) return res.status(400).json({ error: "Invalid schedule" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT * FROM pairing_codes WHERE code = $1 AND user_id = $2 AND status = 'detected' AND expires_at > now() FOR UPDATE`,
      [code, req.userId]
    );
    const pairing = rows[0];
    if (!pairing) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "No detected hardware for that code — run the helper again." });
    }

    const spec = pairing.detected_spec;

    // The agent token authenticates the resident job-execution agent this
    // node's owner runs separately from the one-shot detection helper — a
    // long-lived credential, unlike the 15-minute pairing code above, so
    // it's minted once here and only ever shown to the owner this one time.
    const agentSecret = crypto.randomBytes(32).toString("hex");
    const agentTokenHash = await bcrypt.hash(agentSecret, 12);

    const nodeRes = await client.query(
      `INSERT INTO nodes (
         owner_id, name, gpu_model, gpu_vendor, gpu_count, vram_gb, ram_gb,
         cpu_model, cpu_cores, os, price_per_hour, active, schedule, renewable,
         source, verification_status, last_verified_at, agent_token_hash
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,$12,$13,'helper','verified',now(),$14)
       RETURNING *`,
      [
        req.userId, name, spec.gpuModel, spec.gpuVendor, spec.gpuCount, spec.vramGb, spec.ramGb,
        spec.cpuModel, spec.cpuCores, spec.os, pricePerHour, schedule, renewable, agentTokenHash,
      ]
    );
    const node = nodeRes.rows[0];

    await client.query(`UPDATE pairing_codes SET status = 'claimed', node_id = $1 WHERE id = $2`, [node.id, pairing.id]);

    await client.query("COMMIT");
    res.status(201).json({ data: { ...nodeRowToApi(node), agentToken: `${node.id}.${agentSecret}` } });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

// Regenerates the agent credential (lost token, suspected compromise).
// Owner-scoped like PATCH/DELETE below. The old token stops working the
// instant this commits.
nodesRouter.post("/:id/agent-token", requireAuth, async (req, res) => {
  const agentSecret = crypto.randomBytes(32).toString("hex");
  const agentTokenHash = await bcrypt.hash(agentSecret, 12);

  const { rows } = await query(
    `UPDATE nodes SET agent_token_hash = $1 WHERE id = $2 AND owner_id = $3 RETURNING id`,
    [agentTokenHash, req.params.id, req.userId]
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });

  res.json({ data: { agentToken: `${rows[0].id}.${agentSecret}` } });
});

const AGENT_ENROLL_TTL_MINUTES = 15;

// Mints a short-lived code the resident agent can redeem for its real
// credential — so a seller never has to see, copy, or paste the long-lived
// secret itself, only this one-time code (see POST /agent-enroll below).
nodesRouter.post("/:id/agent-enroll-codes", requireAuth, idempotent("nodes-agent-enroll-codes"), async (req, res) => {
  const owned = await query(`SELECT id FROM nodes WHERE id = $1 AND owner_id = $2`, [req.params.id, req.userId]);
  if (!owned.rows[0]) return res.status(404).json({ error: "Not found" });

  await query(
    `UPDATE agent_enroll_codes SET status = 'expired' WHERE node_id = $1 AND status = 'pending'`,
    [req.params.id]
  );

  const code = crypto.randomBytes(4).toString("hex").toUpperCase();
  const expiresAt = new Date(Date.now() + AGENT_ENROLL_TTL_MINUTES * 60_000);
  await query(
    `INSERT INTO agent_enroll_codes (code, node_id, expires_at) VALUES ($1, $2, $3)`,
    [code, req.params.id, expiresAt]
  );

  res.status(201).json({ data: { code, expiresAt } });
});

// Called by the helper binary, not the browser — no auth, same shape as
// POST /detect. Redeeming always mints a fresh secret, so the code is only
// ever useful once and a leaked code can't be replayed after the agent has
// already picked it up.
nodesRouter.post("/agent-enroll", detectLimiter, async (req, res) => {
  const code = String(req.body?.code || "").toUpperCase();
  if (!code) return res.status(400).json({ error: "code is required" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT node_id FROM agent_enroll_codes WHERE code = $1 AND status = 'pending' AND expires_at > now() FOR UPDATE`,
      [code]
    );
    if (!rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Invalid or expired code" });
    }
    const nodeId = rows[0].node_id;

    const agentSecret = crypto.randomBytes(32).toString("hex");
    const agentTokenHash = await bcrypt.hash(agentSecret, 12);
    await client.query(`UPDATE nodes SET agent_token_hash = $1 WHERE id = $2`, [agentTokenHash, nodeId]);
    await client.query(`UPDATE agent_enroll_codes SET status = 'claimed' WHERE code = $1`, [code]);

    await client.query("COMMIT");
    res.json({ data: { nodeId, agentToken: `${nodeId}.${agentSecret}` } });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});


// Edits the commercial terms of a listing. Hardware fields are deliberately
// not accepted here — they only ever come from a helper report, which is
// what makes a listing's specs trustworthy.
nodesRouter.patch("/:id", requireAuth, async (req, res) => {
  const updates = [];
  const values = [];
  const set = (col, val) => { values.push(val); updates.push(`${col} = $${values.length}`); };

  if (req.body?.name !== undefined) {
    const name = String(req.body.name).trim().slice(0, 100);
    if (!name) return res.status(400).json({ error: "Name can't be empty" });
    set("name", name);
  }
  if (req.body?.pricePerHour !== undefined) {
    const price = Number(req.body.pricePerHour);
    if (!inRange(price, PRICE_MIN, PRICE_MAX)) {
      return res.status(400).json({ error: `Price must be between $${PRICE_MIN} and $${PRICE_MAX} per hour` });
    }
    set("price_per_hour", price);
  }
  if (req.body?.schedule !== undefined) {
    if (!SCHEDULES.includes(req.body.schedule)) return res.status(400).json({ error: "Invalid schedule" });
    set("schedule", req.body.schedule);
  }
  if (req.body?.renewable !== undefined) set("renewable", !!req.body.renewable);
  if (req.body?.active !== undefined) set("active", !!req.body.active);

  if (!updates.length) return res.status(400).json({ error: "Nothing to update" });

  values.push(req.params.id, req.userId);
  const { rows } = await query(
    `UPDATE nodes SET ${updates.join(", ")}
     WHERE id = $${values.length - 1} AND owner_id = $${values.length}
     RETURNING *`,
    values
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json({ data: nodeRowToApi(rows[0]) });
});

// Removes a listing outright. Listings with rental history are kept so the
// jobs referencing them stay readable — pausing is the right move there.
nodesRouter.delete("/:id", requireAuth, async (req, res) => {
  const owned = await query(`SELECT id FROM nodes WHERE id = $1 AND owner_id = $2`, [req.params.id, req.userId]);
  if (!owned.rows[0]) return res.status(404).json({ error: "Not found" });

  // Video attempts carry provider earnings just like jobs, so they block a
  // hard delete the same way (and their foreign keys would anyway).
  const jobs = await query(`SELECT 1 FROM jobs WHERE node_id = $1
    UNION ALL SELECT 1 FROM video_attempts WHERE node_id = $1
    UNION ALL SELECT 1 FROM video_projects WHERE pinned_node_id = $1 LIMIT 1`, [req.params.id]);
  if (jobs.rows[0]) {
    return res.status(409).json({ error: "This listing has rental history, so it can't be deleted. Pause it instead to take it off the marketplace." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // The claimed pairing code points back at this node; clear it first so
    // the FK doesn't block the delete.
    await client.query(`UPDATE pairing_codes SET node_id = NULL WHERE node_id = $1`, [req.params.id]);
    await client.query(`DELETE FROM video_qualifications WHERE node_id = $1`, [req.params.id]);
    await client.query(`DELETE FROM nodes WHERE id = $1 AND owner_id = $2`, [req.params.id, req.userId]);
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});
