import test from "node:test";
import assert from "node:assert/strict";
import { buildQuote, SHOT_PRESET, FAST_SHOT_PRESET, REFERENCE_PRESET, requestSpec, validatePlan, compileTasks,
  canReserve, canEverReserve, actualCost, seedFor, qualificationStats, canaryPlan, CANARY_PLANS } from "./policy.js";

const workers = [
  { preset_id: SHOT_PRESET, price_per_hour: 0.3, p50_seconds: 180, p95_seconds: 210, acceptance: 0.8 },
  { preset_id: REFERENCE_PRESET, price_per_hour: 0.2, p50_seconds: 25, p95_seconds: 40, acceptance: 0.9 },
];
test("30-second quote stays at 60 cents with room for overhead, payment fees and margin", () => {
  const quote = buildQuote(30, workers);
  assert.equal(quote.priceMicros, 600000);
  assert.ok(quote.expectedComputeMicros < quote.computeCapMicros);
  assert.equal(quote.computeCapMicros + quote.overheadMicros + quote.paymentMicros + quote.marginMicros, 600000);
  assert.ok(quote.firstPassReserveMicros <= quote.computeCapMicros);
});
test("expensive, unqualified and missing worker pools cannot produce a cheap quote", () => {
  assert.throws(() => buildQuote(30, []), /capacity/);
  assert.throws(() => buildQuote(30, workers.map((w) => ({ ...w, acceptance: 0.4 }))), /capacity/);
  assert.throws(() => buildQuote(30, workers.map((w) => ({ ...w, price_per_hour: 5 }))), /fixed price/);
});
test("invalid requests and wrong shot counts fail before spending compute", () => {
  assert.throws(() => requestSpec({ prompt: "cat", durationSeconds: 30 }));
  assert.throws(() => requestSpec({ prompt: "A cat in a garden", durationSeconds: 29 }));
  assert.throws(() => validatePlan({ visualBible: "orange robot", referencePrompt: "robot in a garden", shots: [] }, { durationSeconds: 30 }));
});
test("compiled dependencies preserve reference conditioning and exact duration", () => {
  const plan = validatePlan({ title: "A garden walk", visualBible: "Orange robot, blue backpack, warm garden", referencePrompt: "Orange robot in the garden",
    shots: Array.from({ length: 6 }, () => ({ prompt: "Robot waves at the camera", storyboardPrompt: "Robot standing in the garden", continuity: "Orange robot with a blue backpack" })) }, { durationSeconds: 30 });
  const tasks = compileTasks("project", plan);
  assert.equal(tasks.length, 13);
  assert.deepEqual(tasks.find((t) => t.key === "shot-5").dependencies, ["storyboard-5"]);
  assert.equal(tasks.filter((t) => t.kind === "shot").reduce((n,t) => n + t.spec.keepFrames, 0), 720);
  assert.equal(seedFor("project", "shot-1"), seedFor("project", "shot-1"));
  assert.notEqual(seedFor("project", "shot-1", 1), seedFor("project", "shot-1", 0));
});
test("a retry cannot spend budget protected for an unattempted sibling", () => {
  const project = { spent_micros: 40000, reserved_micros: 0, compute_cap_micros: 100000, quote: { shotReserveMicros: 40000, referenceReserveMicros: 5000 } };
  const tasks = [{ id: "retry", kind: "shot", status: "queued", attempt_count: 1 }, { id: "new", kind: "shot", status: "queued", attempt_count: 0 }];
  assert.equal(canReserve(project, tasks, tasks[0], 30000), false);
  assert.equal(canReserve(project, tasks, tasks[0], 20000), true);
});
test("provider earnings use microdollars and never exceed the reservation", () => {
  const attempt = { started_at: new Date(0), max_seconds: 200, reserved_micros: 16667, hourly_micros: 300000 };
  assert.equal(actualCost(attempt, 90000), 7500);
  assert.equal(actualCost(attempt, 1000000), 16667);
  assert.equal(actualCost({ ...attempt, started_at: null }), 0);
});
test("measured records need enough samples and count failures against acceptance, not speed", () => {
  const at = (seconds) => ({ started_at: new Date(0), completed_at: new Date(seconds * 1000) });
  const done = (seconds, accepted = true) => ({ id: `d${seconds}`, status: "done", accepted, ...at(seconds) });
  assert.equal(qualificationStats(Array.from({ length: 19 }, (_, i) => done(100 + i))), null);
  const attempts = [...Array.from({ length: 18 }, (_, i) => done(100 + i * 10)), done(400, false), { id: "f", status: "failed", started_at: new Date(0), completed_at: new Date(5000) }];
  const stats = qualificationStats(attempts);
  assert.equal(stats.samples, 20);
  assert.equal(stats.acceptance, 18 / 20);
  assert.equal(stats.p50, 190);
  assert.equal(stats.p95, 400);
  assert.equal(qualificationStats(attempts.map((a) => ({ ...a, accepted: false }))), null);
  assert.equal(qualificationStats(Array.from({ length: 25 }, (_, i) => ({ id: `r${i}`, status: "review", ...at(100) }))), null);
});
test("an unaffordable retry is detected even while other attempts hold reservations", () => {
  const project = { spent_micros: 90000, reserved_micros: 5000, compute_cap_micros: 100000, quote: { shotReserveMicros: 40000, referenceReserveMicros: 5000 } };
  const tasks = [{ id: "retry", kind: "shot", status: "queued", attempt_count: 1 }];
  assert.equal(canReserve(project, tasks, tasks[0], 6000), false);
  assert.equal(canEverReserve(project, tasks, tasks[0], 6000), true, "waiting for the in-flight attempt can free enough budget");
  assert.equal(canEverReserve(project, tasks, tasks[0], 20000), false, "no outcome of in-flight work can make this retry fit");
});
test("planner text is cut at a word boundary to what the GPU text encoders can read", () => {
  const long = "a ".repeat(400) + "tail";
  const plan = validatePlan({ title: "Long plan", visualBible: long, referencePrompt: long, shots: [{ prompt: long, storyboardPrompt: long, continuity: long }] }, { durationSeconds: 5 });
  assert.ok(plan.referencePrompt.length <= 320 && plan.shots[0].storyboardPrompt.length <= 320);
  assert.ok(plan.visualBible.length <= 800 && plan.shots[0].prompt.length <= 800 && plan.shots[0].continuity.length <= 400);
  assert.ok(!plan.referencePrompt.endsWith(" "));
  assert.throws(() => validatePlan({ title: "Blank plan", visualBible: " ", referencePrompt: "ok prompt", shots: [] }, { durationSeconds: 5 }), /visual specification/);
});
test("canary plans compile with and without shots for smaller cards", () => {
  for (let index = 0; index < CANARY_PLANS.length; index++) {
    const { plan, style } = canaryPlan(index);
    assert.ok(["realistic", "anime", "3d", "stop-motion"].includes(style));
    assert.deepEqual(validatePlan(plan, { durationSeconds: 30 }).shots.map((s) => s.prompt), plan.shots.map((s) => s.prompt));
    assert.equal(compileTasks("p", plan).length, 13);
    assert.equal(compileTasks("p", plan, { includeShots: false }).filter((t) => t.kind === "shot").length, 0);
  }
});
test("the quote uses whichever qualified shot preset is cheaper per accepted shot", () => {
  const fast = { preset_id: FAST_SHOT_PRESET, price_per_hour: 0.3, p50_seconds: 120, p95_seconds: 150, acceptance: 0.85 };
  const quote = buildQuote(30, [...workers, fast]);
  assert.equal(quote.presetId, FAST_SHOT_PRESET);
  assert.ok(quote.expectedComputeMicros < buildQuote(30, workers).expectedComputeMicros);
  assert.equal(buildQuote(30, [...workers, { ...fast, acceptance: 0.5 }]).presetId, SHOT_PRESET, "a preset below the admission bar is ignored");
});
// Planning envelopes, not measurements: Wan reports under nine minutes for a
// 50-step 720p shot on a 4090, so ~400 s at 30 steps; the 3-step distilled
// preset is assumed near 120 s, dominated by text encoding and VAE decode.
test("at the published-runtime envelope only a distilled preset can quote 30 seconds for $0.60", () => {
  const reference = { preset_id: REFERENCE_PRESET, price_per_hour: 0.3, p50_seconds: 40, p95_seconds: 60, acceptance: 0.9 };
  const thirtyStep = { preset_id: SHOT_PRESET, price_per_hour: 0.3, p50_seconds: 400, p95_seconds: 480, acceptance: 0.8 };
  assert.throws(() => buildQuote(30, [reference, thirtyStep]), /fixed price/);
  assert.throws(() => buildQuote(5, [reference, thirtyStep]), /fixed price/);
  const distilled = { preset_id: FAST_SHOT_PRESET, price_per_hour: 0.3, p50_seconds: 120, p95_seconds: 150, acceptance: 0.8 };
  const quote = buildQuote(30, [reference, thirtyStep, distilled]);
  assert.equal(quote.presetId, FAST_SHOT_PRESET);
  assert.ok(quote.expectedComputeMicros < 110_000, `expected about $0.10 of GPU time, got ${quote.expectedComputeMicros}`);
  assert.ok(quote.firstPassReserveMicros <= quote.computeCapMicros);
  assert.ok(buildQuote(5, [reference, distilled]).priceMicros === 120_000);
});
