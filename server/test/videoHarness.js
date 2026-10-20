import { PGlite } from "@electric-sql/pglite";
import { readdir, readFile, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { VideoService } from "../src/lib/video/service.js";
import { VideoStorage } from "../src/lib/video/storage.js";
import { SHOT_PRESET, REFERENCE_PRESET } from "../src/lib/video/policy.js";

export async function harness() {
  const db = new PGlite();
  const migrations = new URL("../db/migrations/", import.meta.url);
  for (const file of (await readdir(migrations)).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = (await readFile(new URL(file, migrations), "utf8")).replace("CREATE EXTENSION IF NOT EXISTS pgcrypto;", "");
    await db.exec(sql);
  }
  // PostgreSQL semantics with a serialized connection pool. This exercises
  // actual constraints, triggers and transactions without a developer DB.
  let tail = Promise.resolve();
  const acquire = async () => { const previous = tail; let release; tail = new Promise((r) => { release = r; }); await previous; return release; };
  const query = async (sql, values) => { const result = await db.query(sql, values); return { ...result, rowCount: result.affectedRows }; };
  const pool = {
    query: async (...args) => { const release = await acquire(); try { return await query(...args); } finally { release(); } },
    connect: async () => { const release = await acquire(); return { query, release }; },
  };
  const userId = crypto.randomUUID(), ownerId = crypto.randomUUID();
  await pool.query(`INSERT INTO users (id,email,balance_usdc) VALUES ($1,'renter@test.local',10),($2,'provider@test.local',0)`, [userId, ownerId]);
  const nodeId = crypto.randomUUID();
  await pool.query(`INSERT INTO nodes (id,name,gpu_model,gpu_vendor,vram_gb,ram_gb,gpu_count,os,owner_id,price_per_hour,last_seen_at)
    VALUES ($1,'Test worker','RTX 4090','nvidia',24,64,1,'linux',$2,0.30,now())`, [nodeId, ownerId]);
  const config = {
    [SHOT_PRESET]: { image: `test/wan@sha256:${"a".repeat(64)}`, revision: "b".repeat(40) },
    [REFERENCE_PRESET]: { image: `test/sdxl@sha256:${"c".repeat(64)}`, revision: "d".repeat(40) },
  };
  for (const preset of [SHOT_PRESET, REFERENCE_PRESET]) {
    await pool.query(`INSERT INTO video_qualifications (node_id,preset_id,image_digest,model_revision,p50_seconds,p95_seconds,acceptance,samples,report_hash)
      VALUES ($1,$2,$3,$4,$5,$6,0.9,30,$7)`, [nodeId, preset, config[preset].image, config[preset].revision, preset === SHOT_PRESET ? 180 : 20, preset === SHOT_PRESET ? 210 : 30, "e".repeat(64)]);
  }
  const root = await mkdtemp(path.join(os.tmpdir(), "decompute-video-test-"));
  const media = { ready: async () => true, inspect: async () => ({ metadata: { fixture: true }, frames: [Buffer.from("frame")] }), assemble: async () => Buffer.from("assembled fixture") };
  let rejectNext = false;
  const models = { ready: true,
    plan: async ({ durationSeconds }) => ({ costMicros: 1000, plan: { version: 1, title: "Garden robot", visualBible: "Orange robot in a garden", referencePrompt: "Robot portrait in a garden",
      shots: Array.from({ length: durationSeconds / 5 }, (_, index) => ({ index, prompt: "Robot waves in the garden", storyboardPrompt: "Robot standing near flowers", continuity: "Orange metal body" })) } }),
    review: async () => { const accepted = !rejectNext; rejectNext = false; return { accepted, reason: accepted ? "Consistent" : "Different subject", costMicros: 200 }; },
  };
  let paused = false;
  const service = new VideoService({ pool, storage: new VideoStorage(root), media, models, config: () => config, enabled: () => true, paused: () => paused });
  return { db, pool, service, userId, ownerId, nodeId, config, media, models,
    rejectNext: () => { rejectNext = true; }, setPaused: (value) => { paused = value; },
    close: async () => { await db.close(); await rm(root, { recursive: true, force: true }); } };
}
