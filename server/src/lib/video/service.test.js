import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { harness } from "../../../test/videoHarness.js";
import { hash, SHOT_PRESET, FAST_SHOT_PRESET, VideoError } from "./policy.js";

const request = { prompt: "An orange robot waves in a sunny garden", durationSeconds: 5, style: "3d" };
async function renderNext(h, nodeId = h.nodeId) {
  const signed = await h.service.assignment(nodeId, `${nodeId}.secret`);
  assert.ok(signed, "expected a queued provider assignment");
  const job = signed.manifest;
  await h.service.claim(nodeId, job.jobId);
  await h.pool.query(`UPDATE video_attempts SET started_at=now()-interval '30 seconds' WHERE id=$1`, [job.jobId]);
  const data = Buffer.from(`fixture-${job.jobId}`);
  await h.service.upload(nodeId, job.jobId, job.result.allowedContentTypes[0], data, hash(data));
  await h.service.finishAttempt(nodeId, job.jobId, "done");
  return job;
}
async function addNode(h, { vram = 24, ram = 64 } = {}) {
  const id = crypto.randomUUID();
  await h.pool.query(`INSERT INTO nodes (id,name,gpu_model,gpu_vendor,vram_gb,ram_gb,gpu_count,os,owner_id,price_per_hour,last_seen_at)
    VALUES ($1,'New worker','RTX 3090','nvidia',$2,$3,1,'linux',$4,0.25,now())`, [id, vram, ram, h.ownerId]);
  return id;
}
const balance = async (h, id) => Number((await h.pool.query(`SELECT balance_usdc FROM users WHERE id=$1`, [id])).rows[0].balance_usdc);

test("full project: plan, shared reference, storyboard, shot, assembly and exact settlement", async () => {
  const h = await harness();
  try {
    const project = await h.service.create(h.userId, request, crypto.randomUUID());
    assert.equal(project.priceUsd, 0.12);
    assert.equal(Number((await h.pool.query(`SELECT balance_usdc FROM users WHERE id=$1`, [h.userId])).rows[0].balance_usdc), 9.88);
    await h.service.tick();
    const reference = await renderNext(h);
    assert.equal(reference.manifest, undefined);
    assert.equal(JSON.parse(reference.execution.envVars.DECOMPUTE_VIDEO_SPEC).kind, "reference");
    await h.service.tick();
    const storyboard = await renderNext(h);
    assert.equal(storyboard.inputs.length, 1);
    await h.service.tick();
    const shot = await renderNext(h);
    assert.equal(shot.inputs.length, 1);
    await h.service.tick();
    const done = await h.service.get(h.userId, project.id);
    assert.equal(done.status, "done");
    assert.equal(done.tasks.length, 3);
    assert.ok(done.tasks.every((task) => task.status === "done"));
    assert.ok((await h.service.artifact(h.userId, project.id)).byte_size > 0);
    const provider = Number((await h.pool.query(`SELECT balance_usdc FROM users WHERE id=$1`, [h.ownerId])).rows[0].balance_usdc);
    assert.ok(provider >= 0.0075 && provider < 0.01);
    const ledger = (await h.pool.query(`SELECT sum(amount) AS net FROM ledger_entries`)).rows[0];
    assert.equal(Number(ledger.net), 0);
    await h.service.finishAttempt(h.nodeId, shot.jobId, "done");
    await h.service.tick();
    assert.equal(Number((await h.pool.query(`SELECT balance_usdc FROM users WHERE id=$1`, [h.ownerId])).rows[0].balance_usdc), provider);
  } finally { await h.close(); }
});

test("duplicate concurrent requests hold funds once; changed input cannot reuse a key", async () => {
  const h = await harness();
  try {
    const key = crypto.randomUUID();
    const results = await Promise.all([h.service.create(h.userId, request, key), h.service.create(h.userId, request, key)]);
    assert.equal(results[0].id, results[1].id);
    assert.equal(Number((await h.pool.query(`SELECT balance_usdc FROM users WHERE id=$1`, [h.userId])).rows[0].balance_usdc), 9.88);
    await assert.rejects(() => h.service.create(h.userId, { ...request, prompt: "A totally different garden robot" }, key), /different video/);
  } finally { await h.close(); }
});

test("cancellation refunds once and fences late uploads, while ownership stays private", async () => {
  const h = await harness();
  try {
    const project = await h.service.create(h.userId, request, crypto.randomUUID());
    await h.service.tick();
    const job = (await h.service.assignment(h.nodeId, "test-token")).manifest;
    await h.service.claim(h.nodeId, job.jobId);
    await assert.rejects(() => h.service.get(h.ownerId, project.id), /not found/);
    await h.service.cancel(h.userId, project.id);
    await h.service.cancel(h.userId, project.id);
    assert.equal(Number((await h.pool.query(`SELECT balance_usdc FROM users WHERE id=$1`, [h.userId])).rows[0].balance_usdc), 10);
    await assert.rejects(() => h.service.upload(h.nodeId, job.jobId, "image/png", Buffer.from("late"), hash("late")), /no longer active/);
    assert.equal(await h.service.assignment(h.nodeId, "test-token"), null);
  } finally { await h.close(); }
});

test("quality rejection pays the valid attempt and changes only its creative retry seed", async () => {
  const h = await harness();
  try {
    const project = await h.service.create(h.userId, request, crypto.randomUUID());
    await h.service.tick();
    const first = await renderNext(h);
    h.rejectNext();
    await h.service.tick();
    const retry = (await h.service.assignment(h.nodeId, "test-token")).manifest;
    assert.notEqual(retry.seed, first.seed);
    assert.notEqual(retry.jobId, first.jobId);
    assert.equal((await h.service.get(h.userId, project.id)).tasks.find((t) => t.task_key === "reference").attempt_count, 2);
    assert.ok(Number((await h.pool.query(`SELECT balance_usdc FROM users WHERE id=$1`, [h.ownerId])).rows[0].balance_usdc) > 0);
  } finally { await h.close(); }
});

test("disconnect retries preserve creative seed and never silently omit required tasks", async () => {
  const h = await harness();
  try {
    const project = await h.service.create(h.userId, request, crypto.randomUUID());
    await h.service.tick();
    const first = (await h.service.assignment(h.nodeId, "test-token")).manifest;
    await h.pool.query(`UPDATE video_attempts SET deadline_at=now()-interval '1 second' WHERE id=$1`, [first.jobId]);
    await h.service.tick();
    const retry = (await h.service.assignment(h.nodeId, "test-token")).manifest;
    assert.equal(retry.seed, first.seed);
    assert.notEqual(retry.jobId, first.jobId);
    assert.equal((await h.service.get(h.userId, project.id)).tasks.length, 3);
  } finally { await h.close(); }
});

test("incident mode freezes video dispatch and ledger movement", async () => {
  const h = await harness();
  try {
    const project = await h.service.create(h.userId, request, crypto.randomUUID());
    h.setPaused(true);
    await h.service.tick();
    await assert.rejects(() => h.service.cancel(h.userId, project.id), /paused/);
    assert.equal((await h.service.get(h.userId, project.id)).status, "queued");
    h.setPaused(false);
    await h.service.cancel(h.userId, project.id);
    assert.equal((await h.service.get(h.userId, project.id)).refunded, true);
  } finally { await h.close(); }
});

test("a provider's canary run qualifies its node from server-measured work and moves no money", async () => {
  const h = await harness();
  try {
    const node = await addNode(h);
    const started = await h.service.createQualification(h.ownerId, node);
    assert.equal(started.run.status, "running");
    assert.equal(started.run.tasks, 52);
    assert.ok(started.presets.every((p) => !p.qualified));
    await h.service.createQualification(h.ownerId, node); // repeating the request while running is harmless
    assert.equal(Number((await h.pool.query(`SELECT count(*) AS n FROM video_projects WHERE kind='qualification'`)).rows[0].n), 4);
    for (let i = 0; i < 200; i++) {
      await h.service.tick();
      if (await h.service.assignment(node, `${node}.secret`)) await renderNext(h, node);
      else if ((await h.service.qualificationStatus(h.ownerId, node)).run.status !== "running") break;
    }
    const finished = await h.service.qualificationStatus(h.ownerId, node);
    assert.equal(finished.run.status, "done");
    assert.equal(finished.run.done, 52);
    const runnable = finished.presets.filter((p) => finished.eligiblePresets.includes(p.presetId));
    assert.equal(runnable.length, 2);
    assert.ok(runnable.every((p) => p.qualified && p.samples >= 20 && p.p50Seconds > 0));
    assert.equal(Number((await h.pool.query(`SELECT count(*) AS n FROM video_attempts a JOIN video_projects p ON p.id=a.project_id
      WHERE p.kind='qualification' AND a.node_id<>$1`, [node])).rows[0].n), 0, "canary work must stay on the pinned node");
    assert.equal(Number((await h.pool.query(`SELECT count(*) AS n FROM ledger_transactions WHERE reference_type='video_project'`)).rows[0].n), 0);
    assert.equal(await balance(h, h.ownerId), 0);
    assert.deepEqual(await h.service.list(h.ownerId), [], "canary projects never appear as the provider's own videos");
    await assert.rejects(h.service.createQualification(h.userId, node), /not found/, "only the owner can qualify a node");
  } finally { await h.close(); }
});

test("a small card qualifies for references and storyboards only", async () => {
  const h = await harness();
  try {
    const node = await addNode(h, { vram: 12, ram: 32 });
    const status = await h.service.createQualification(h.ownerId, node);
    assert.equal(status.run.tasks, 28);
    assert.equal(Number((await h.pool.query(`SELECT count(*) AS n FROM video_tasks WHERE kind='shot'`)).rows[0].n), 0);
    await assert.rejects(h.service.createQualification(h.ownerId, await addNode(h, { vram: 8, ram: 16 })), /12 GB VRAM/);
  } finally { await h.close(); }
});

test("production results keep a node's record honest and drop it from quotes when quality falls", async () => {
  const h = await harness();
  try {
    assert.ok(await h.service.quote(5));
    const project = await h.service.create(h.userId, request, crypto.randomUUID());
    await h.service.tick();
    const task = (await h.pool.query(`SELECT id FROM video_tasks WHERE project_id=$1 AND task_key='reference'`, [project.id])).rows[0];
    const spec = { presetId: SHOT_PRESET, image: h.config[SHOT_PRESET].image, modelRevision: h.config[SHOT_PRESET].revision };
    for (let i = 0; i < 20; i++) await h.pool.query(`INSERT INTO video_attempts (task_id,project_id,node_id,owner_id,attempt_number,status,
      manifest_spec,hourly_micros,reserved_micros,max_seconds,deadline_at,started_at,completed_at,result_metadata)
      VALUES ($1,$2,$3,$4,$5,'done',$6,0,0,300,now(),now()-interval '200 seconds',now(),$7)`,
      [task.id, project.id, h.nodeId, h.ownerId, 100 + i, JSON.stringify(spec), JSON.stringify({ quality: { accepted: i < 10 } })]);
    await h.service.refreshQualification(h.pool, h.nodeId, SHOT_PRESET);
    const record = (await h.pool.query(`SELECT * FROM video_qualifications WHERE node_id=$1 AND preset_id=$2`, [h.nodeId, SHOT_PRESET])).rows[0];
    assert.equal(Number(record.acceptance), 0.5);
    assert.equal(Number(record.p50_seconds), 200);
    await assert.rejects(h.service.quote(5), /capacity/);
  } finally { await h.close(); }
});

test("a transient planner outage waits; a permanent planning failure refunds immediately", async () => {
  const h = await harness();
  try {
    const plan = h.models.plan;
    h.models.plan = async () => { throw new VideoError(503, "provider busy", { retryable: true }); };
    const project = await h.service.create(h.userId, request, crypto.randomUUID());
    await h.service.tick();
    let state = await h.service.get(h.userId, project.id);
    assert.equal(state.status, "planning");
    assert.equal(state.refunded, false);
    assert.equal(Number((await h.pool.query(`SELECT model_api_micros FROM video_projects WHERE id=$1`, [project.id])).rows[0].model_api_micros), 0);
    h.models.plan = plan;
    await h.service.tick();
    assert.equal((await h.service.get(h.userId, project.id)).status, "rendering");
    h.models.plan = async () => { throw new VideoError(422, "Could not create a valid video plan within the repair budget.", { costMicros: 4000 }); };
    const second = await h.service.create(h.userId, { ...request, prompt: "A second robot dances in the rain" }, crypto.randomUUID());
    await h.service.tick();
    state = await h.service.get(h.userId, second.id);
    assert.equal(state.status, "failed");
    assert.equal(state.refunded, true);
    assert.equal(await balance(h, h.userId), 9.88);
  } finally { await h.close(); }
});

test("a retry that can never fit the fixed price ends the project now instead of at expiry", async () => {
  const h = await harness();
  try {
    const project = await h.service.create(h.userId, request, crypto.randomUUID());
    await h.service.tick();
    const job = (await h.service.assignment(h.nodeId, "test-token")).manifest;
    await h.service.claim(h.nodeId, job.jobId);
    await h.service.finishAttempt(h.nodeId, job.jobId, "failed", "CUDA out of memory");
    await h.pool.query(`UPDATE video_projects SET spent_micros=compute_cap_micros-1 WHERE id=$1`, [project.id]);
    await h.service.tick();
    const state = await h.service.get(h.userId, project.id);
    assert.equal(state.status, "failed");
    assert.match(state.failureReason, /budget/);
    assert.equal(state.refunded, true);
  } finally { await h.close(); }
});

test("qualification defaults to the cheapest enabled shot preset and honours an explicit choice", async () => {
  const h = await harness();
  try {
    h.config[FAST_SHOT_PRESET] = { image: `test/fastwan@sha256:${"f".repeat(64)}`, revision: "e".repeat(40) };
    const fastNode = await addNode(h), baseNode = await addNode(h);
    await h.service.createQualification(h.ownerId, fastNode);
    await h.service.createQualification(h.ownerId, baseNode, SHOT_PRESET);
    await assert.rejects(h.service.createQualification(h.ownerId, await addNode(h), "not-a-preset"), /cannot run/);
    const runs = (await h.pool.query(`SELECT DISTINCT p.pinned_node_id AS node, p.quote->>'presetId' AS preset, (t.spec->>'steps')::int AS steps
      FROM video_projects p JOIN video_tasks t ON t.project_id=p.id AND t.kind='shot' WHERE p.kind='qualification'`)).rows;
    assert.deepEqual(runs.find((r) => r.node === fastNode), { node: fastNode, preset: FAST_SHOT_PRESET, steps: 3 });
    assert.deepEqual(runs.find((r) => r.node === baseNode), { node: baseNode, preset: SHOT_PRESET, steps: 30 });
  } finally { await h.close(); }
});
