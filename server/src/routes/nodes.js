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
    `SELECT status, detected_spec, expires_at FROM pairing_codes WHERE code = $1 AND user_id = $2`,
    [code, req.userId]
  );
  const row = rows[0];
  if (!row) return res.status(404).json({ error: "Not found" });

  let status = row.status;
  if (status === "pending" && new Date(row.expires_at) < new Date()) {
    await query(`UPDATE pairing_codes SET status = 'expired' WHERE code = $1`, [code]);
    status = "expired";
  }

  res.json({ data: { status, detectedSpec: row.detected_spec, expiresAt: row.expires_at } });
});

// Called by the helper binary, not the browser — no auth. Only ever writes
// to the pairing_codes row the code identifies; never resolves or reveals
// which user that is.
nodesRouter.post("/detect", detectLimiter, async (req, res) => {
  const code = String(req.body?.code || "").toUpperCase();
  const os = String(req.body?.os || "");
  const hostname = req.body?.hostname ? String(req.body.hostname).slice(0, 200) : null;
  const gpu = req.body?.gpu || {};
  const ram = req.body?.ram || {};
  const cpu = req.body?.cpu || {};

  const gpuVendor = gpu.vendor ? String(gpu.vendor).slice(0, 50) : null;
  const gpuModel = String(gpu.model || "Unknown").slice(0, 200);
  const gpuCount = Number(gpu.count);
  const vramGb = Number(gpu.vramGb);
  const ramGb = Number(ram.totalGb);
  const cpuModel = cpu.model ? String(cpu.model).slice(0, 200) : null;
  const cpuCores = Number(cpu.cores);

  if (!code) return res.status(400).json({ error: "code is required" });
  if (!OSES.includes(os)) return res.status(400).json({ error: "Invalid os" });
  if (!inRange(gpuCount, 1, 16)) return res.status(400).json({ error: "Invalid gpu.count" });
  if (!inRange(vramGb, 0, 256)) return res.status(400).json({ error: "Invalid gpu.vramGb" });
  if (!inRange(ramGb, 0, 2048)) return res.status(400).json({ error: "Invalid ram.totalGb" });
  if (!inRange(cpuCores, 1, 256)) return res.status(400).json({ error: "Invalid cpu.cores" });

  const detectedSpec = { os, hostname, gpuVendor, gpuModel, gpuCount, vramGb, ramGb, cpuModel, cpuCores };

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

  const jobs = await query(`SELECT 1 FROM jobs WHERE node_id = $1 LIMIT 1`, [req.params.id]);
  if (jobs.rows[0]) {
    return res.status(409).json({ error: "This listing has rental history, so it can't be deleted. Pause it instead to take it off the marketplace." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // The claimed pairing code points back at this node; clear it first so
    // the FK doesn't block the delete.
    await client.query(`UPDATE pairing_codes SET node_id = NULL WHERE node_id = $1`, [req.params.id]);
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
