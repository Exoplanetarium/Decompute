import { Router } from "express";
import crypto from "node:crypto";
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
  };
}

nodesRouter.get("/", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const { rows } = await query(
    `SELECT * FROM nodes WHERE active = true ORDER BY created_at DESC LIMIT $1`,
    [limit]
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
    const nodeRes = await client.query(
      `INSERT INTO nodes (
         owner_id, name, gpu_model, gpu_vendor, gpu_count, vram_gb, ram_gb,
         cpu_model, cpu_cores, os, price_per_hour, active, schedule, renewable,
         source, verification_status, last_verified_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,$12,$13,'helper','verified',now())
       RETURNING *`,
      [
        req.userId, name, spec.gpuModel, spec.gpuVendor, spec.gpuCount, spec.vramGb, spec.ramGb,
        spec.cpuModel, spec.cpuCores, spec.os, pricePerHour, schedule, renewable,
      ]
    );
    const node = nodeRes.rows[0];

    await client.query(`UPDATE pairing_codes SET status = 'claimed', node_id = $1 WHERE id = $2`, [node.id, pairing.id]);

    await client.query("COMMIT");
    res.status(201).json({ data: nodeRowToApi(node) });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});
