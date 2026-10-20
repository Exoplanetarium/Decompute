import crypto from "node:crypto";

export const MICROS = 1_000_000;
export const PRICES = Object.freeze({ 5: 120_000, 15: 330_000, 30: 600_000 });
export const TERMINAL = new Set(["done", "failed", "cancelled"]);
export const MAX_ATTEMPTS = 3;
// Every preset is admitted only after independent quality/speed
// qualification of its exact image: an operator enables one by pinning its
// image digest and model revision, and nodes qualify for it individually.
// The 30-step candidate is a shortened schedule, not a claimed distillation.
export const SHOT_PRESET = "wan-2.2-5b-720-30-v1";
// FastVideo's 3-step DMD distillation of the same Wan 2.2 5B model, same
// 1280×704×121 output. Published for text-to-video; its image-conditioned
// quality is exactly what qualification and per-shot review must establish.
export const FAST_SHOT_PRESET = "fastwan-2.2-5b-720-3-v1";
export const REFERENCE_PRESET = "sdxl-ipadapter-v1";
export const PRESETS = Object.freeze({
  [SHOT_PRESET]: { kind: "shot", steps: 30, workloadId: "video-generation", modelId: "Wan-AI/Wan2.2-TI2V-5B-Diffusers", minVramGb: 24, minRamGb: 48, maxSeconds: 900, schema: "decompute.video.v1", contentType: "video/mp4", maxBytes: 16 * 1024 * 1024 },
  [FAST_SHOT_PRESET]: { kind: "shot", steps: 3, workloadId: "video-generation-fast", modelId: "FastVideo/FastWan2.2-TI2V-5B-FullAttn-Diffusers", minVramGb: 24, minRamGb: 48, maxSeconds: 600, schema: "decompute.video.v1", contentType: "video/mp4", maxBytes: 16 * 1024 * 1024 },
  [REFERENCE_PRESET]: { kind: "reference", workloadId: "video-reference", modelId: "stabilityai/stable-diffusion-xl-base-1.0", minVramGb: 12, minRamGb: 24, maxSeconds: 240, schema: "decompute.image.v1", contentType: "image/png", maxBytes: 8 * 1024 * 1024 },
});
// Fewest denoising steps first: the cheapest preset to qualify a node for.
export const SHOT_PRESETS = Object.keys(PRESETS).filter((id) => PRESETS[id].kind === "shot").sort((a, b) => PRESETS[a].steps - PRESETS[b].steps);
// A node's measured record is rebuilt from its most recent finished attempts,
// so qualification keeps tracking real behaviour after the canary run.
export const QUALIFICATION_SAMPLES = 20;
export const QUALIFICATION_WINDOW = 50;
export const QUALIFICATION_PROJECTS = 4;

export class VideoError extends Error {
  constructor(status, message, { retryable = false, costMicros } = {}) {
    super(message); this.status = status; this.retryable = retryable;
    if (costMicros !== undefined) this.costMicros = costMicros;
  }
}
export const hash = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
export const usd = (micros) => Number(micros) / MICROS;
export const toMicros = (value) => Math.round(Number(value) * MICROS);
export const seedFor = (projectId, taskKey, revision = 0) => crypto.createHash("sha256").update(`${projectId}:${taskKey}:${revision}`).digest().readUInt32BE(0);

export function requestSpec(input) {
  const prompt = typeof input?.prompt === "string" ? input.prompt.trim() : "";
  const durationSeconds = Number(input?.durationSeconds);
  const style = input?.style || "3d";
  if (prompt.length < 10 || prompt.length > 1600) throw new VideoError(400, "Describe the video in 10–1,600 characters.");
  if (!Object.hasOwn(PRICES, durationSeconds)) throw new VideoError(400, "Choose 5, 15, or 30 seconds.");
  if (!["realistic", "anime", "3d", "stop-motion"].includes(style)) throw new VideoError(400, "Unsupported visual style.");
  return { prompt, durationSeconds, style };
}

export function budgetFor(durationSeconds) {
  const priceMicros = PRICES[durationSeconds];
  if (!priceMicros) throw new VideoError(400, "Unsupported video duration.");
  const shots = durationSeconds / 5;
  const paymentMicros = Math.ceil(priceMicros * 0.059); // $10 fully spent wallet top-up
  const overheadMicros = 20_000 + shots * 6_000; // API, assembly, storage, support; references are compute
  const marginMicros = Math.ceil(priceMicros * 0.35);
  return { priceMicros, shots, paymentMicros, overheadMicros, marginMicros,
    computeCapMicros: priceMicros - paymentMicros - overheadMicros - marginMicros };
}

export function workerCost(worker) {
  const p50 = Number(worker.p50_seconds), p95 = Number(worker.p95_seconds), acceptance = Number(worker.acceptance);
  const hourlyMicros = toMicros(worker.price_per_hour);
  if (![p50, p95, acceptance, hourlyMicros].every(Number.isFinite) || p50 <= 0 || p95 < p50 || acceptance < 0.8 || acceptance > 1 || hourlyMicros <= 0) return null;
  const maxSeconds = Math.ceil(p95 * 1.2 + 20);
  if (maxSeconds > (PRESETS[worker.preset_id]?.maxSeconds || 0)) return null;
  return { hourlyMicros, maxSeconds, reserveMicros: Math.ceil(hourlyMicros * maxSeconds / 3600),
    expectedMicros: Math.ceil(hourlyMicros * p50 / (3600 * acceptance)) };
}

// Canary renders for an unqualified node: unpaid, bounded only by the
// preset's hard runtime ceiling, and measured by the server itself.
export const qualificationCost = (presetId) => ({ hourlyMicros: 0, maxSeconds: PRESETS[presetId].maxSeconds, reserveMicros: 0, expectedMicros: 0 });

export function buildQuote(durationSeconds, candidates, now = Date.now()) {
  const budget = budgetFor(durationSeconds);
  const best = (presetId) => candidates.filter((w) => w.preset_id === presetId).map((worker) => ({ worker, cost: workerCost(worker) }))
    .filter((entry) => entry.cost).sort((a, b) => a.cost.expectedMicros - b.cost.expectedMicros)[0];
  const reference = best(REFERENCE_PRESET);
  // One shot preset per project keeps every cut from the same model family;
  // the cheapest qualified preset wins.
  const options = reference ? SHOT_PRESETS.map((presetId) => ({ presetId, shot: best(presetId) })).filter((o) => o.shot).map((o) => ({ ...o,
    expectedComputeMicros: budget.shots * o.shot.cost.expectedMicros + (budget.shots + 1) * reference.cost.expectedMicros,
    firstPassReserveMicros: budget.shots * o.shot.cost.reserveMicros + (budget.shots + 1) * reference.cost.reserveMicros,
  })).sort((a, b) => a.expectedComputeMicros - b.expectedComputeMicros) : [];
  if (!options.length) throw new VideoError(503, "Affordable video capacity is not ready yet. No funds have been reserved.");
  const chosen = options.find((o) => Math.max(o.expectedComputeMicros, o.firstPassReserveMicros) <= budget.computeCapMicros);
  if (!chosen) throw new VideoError(503, "Available workers cannot meet this video's fixed price. Please try again later.");
  return { ...budget, expectedComputeMicros: chosen.expectedComputeMicros, firstPassReserveMicros: chosen.firstPassReserveMicros,
    shotReserveMicros: chosen.shot.cost.reserveMicros, referenceReserveMicros: reference.cost.reserveMicros, presetId: chosen.presetId,
    durationSeconds, width: 1280, height: 720, fps: 24, audio: false,
    quotedAt: new Date(now).toISOString(), expiresAt: new Date(now + 60_000).toISOString() };
}

// Over-long model text is cut at a word boundary rather than rejected: the
// limits exist because the GPU text encoders truncate (SDXL's CLIP reads 77
// tokens, Wan's umT5 512), and a repair call costs more than a clean cut.
const text = (value, label, max = 800) => {
  if (typeof value !== "string" || value.trim().length < 3) throw new VideoError(422, `Missing ${label}.`);
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  const cut = trimmed.slice(0, max);
  return (cut.slice(0, cut.lastIndexOf(" ")) || cut).replace(/[\s,;:]+$/, "");
};
export function validatePlan(raw, request) {
  const shared = text(raw?.visualBible, "visual specification", 800);
  const referencePrompt = text(raw?.referencePrompt, "reference prompt", 320);
  if (!Array.isArray(raw?.shots) || raw.shots.length !== request.durationSeconds / 5) throw new VideoError(422, `Return exactly ${request.durationSeconds / 5} shots.`);
  const shots = raw.shots.map((shot, index) => ({
    index, durationSeconds: 5,
    prompt: text(shot?.prompt, "shot prompt", 800),
    storyboardPrompt: text(shot?.storyboardPrompt, "storyboard prompt", 320),
    continuity: text(shot?.continuity, "continuity description", 400),
  }));
  return { version: 1, title: text(raw.title, "title", 100), visualBible: shared, referencePrompt, shots };
}

export function compileTasks(projectId, plan, { shotPreset = SHOT_PRESET, includeShots = true } = {}) {
  const tasks = [{ key: "reference", kind: "reference", dependencies: [], spec: { prompt: plan.referencePrompt, visualBible: plan.visualBible } }];
  for (const shot of plan.shots) {
    const key = `shot-${shot.index}`;
    tasks.push({ key: `storyboard-${shot.index}`, kind: "storyboard", shotIndex: shot.index, dependencies: ["reference"],
      spec: { prompt: shot.storyboardPrompt, visualBible: plan.visualBible, continuity: shot.continuity } });
    if (includeShots) tasks.push({ key, kind: "shot", shotIndex: shot.index, dependencies: [`storyboard-${shot.index}`],
      spec: { prompt: shot.prompt, visualBible: plan.visualBible, continuity: shot.continuity, frames: 121, keepFrames: 120, fps: 24, width: 1280, height: 704, steps: PRESETS[shotPreset].steps } });
  }
  return tasks.map((task) => ({ ...task, seed: seedFor(projectId, task.key) }));
}

const protectedMicros = (project, tasks, task) => tasks.filter((t) => t.id !== task.id && t.status === "queued" && t.attempt_count === 0)
  .reduce((sum, t) => sum + (t.kind === "shot" ? project.quote.shotReserveMicros : project.quote.referenceReserveMicros), 0);
export function canReserve(project, tasks, task, reserveMicros) {
  // Preserve room for the first attempt of every sibling. A retry cannot
  // consume the budget needed to finish the rest of the original timeline.
  return Number(project.spent_micros) + Number(project.reserved_micros) + reserveMicros + protectedMicros(project, tasks, task) <= Number(project.compute_cap_micros);
}
// Even if every in-flight attempt released its whole reservation, this task
// still could not fit: waiting cannot help, so the project should end now.
export function canEverReserve(project, tasks, task, reserveMicros) {
  return Number(project.spent_micros) + reserveMicros + protectedMicros(project, tasks, task) <= Number(project.compute_cap_micros);
}

export function actualCost(attempt, endedAt = Date.now()) {
  if (!attempt.started_at) return 0;
  const seconds = Math.max(0, Math.min(Number(attempt.max_seconds), (endedAt - new Date(attempt.started_at).getTime()) / 1000));
  return Math.min(Number(attempt.reserved_micros), Math.ceil(Number(attempt.hourly_micros) * seconds / 3600));
}

// Builds a node's measured record from its finished attempts on one exact
// image and model revision. Acceptance counts technical failures and quality
// rejections alike: it is the probability that an attempt yields a usable
// result. Returns null until there are enough samples to trust.
export function qualificationStats(attempts) {
  const finished = attempts.filter((a) => a.status === "failed" || (a.status === "done" && typeof a.accepted === "boolean"));
  if (finished.length < QUALIFICATION_SAMPLES) return null;
  const seconds = finished.filter((a) => a.status === "done" && a.started_at && a.completed_at)
    .map((a) => (new Date(a.completed_at) - new Date(a.started_at)) / 1000).filter((s) => s > 0).sort((a, b) => a - b);
  const accepted = finished.filter((a) => a.status === "done" && a.accepted).length;
  if (!seconds.length || !accepted) return null;
  const rank = (p) => seconds[Math.min(seconds.length - 1, Math.ceil(p * seconds.length) - 1)];
  return { samples: finished.length, p50: rank(0.5), p95: rank(0.95), acceptance: accepted / finished.length,
    attemptIds: finished.map((a) => a.id) };
}

// Canary plans exercise distinct subjects, materials and motion so a node's
// record is not tuned to one easy prompt.
export const CANARY_PLANS = Object.freeze([
  { style: "3d", title: "Garden robot", subject: "The small orange robot", visualBible: "A small orange robot with round lens eyes and a blue canvas backpack, in a sunlit cottage garden with lavender, stone paths and a wooden fence. Warm afternoon light, soft shadows, saturated 3D animation look.",
    referencePrompt: "3D animation still: small orange robot with round lens eyes and a blue backpack standing on a stone path in a sunlit cottage garden, lavender, wooden fence, warm light",
    shots: ["walks left to right along the stone path; slow tracking shot", "kneels and sniffs a lavender flower; slow push in", "waves at the camera; static medium shot", "looks up at a butterfly passing overhead; gentle tilt up", "opens the garden gate; over-the-shoulder shot", "sits on the fence as the sun lowers; slow pull back"] },
  { style: "realistic", title: "Fox in snow", subject: "The red fox", visualBible: "A red fox with a white-tipped tail and black legs in a quiet birch forest after fresh snowfall. Overcast blue-grey light, falling snowflakes, shallow depth of field, natural documentary look.",
    referencePrompt: "Wildlife photograph: red fox with white-tipped tail standing in fresh snow in a birch forest, overcast light, falling snow, shallow depth of field",
    shots: ["trots through deep snow toward the camera; low tracking shot", "pauses and tilts its head, listening; slow push in", "pounces into the snow; static wide shot", "shakes snow from its fur; medium shot", "sniffs a fallen birch log; slow lateral dolly", "walks away into the trees; slow pull back"] },
  { style: "stop-motion", title: "Paper boat", subject: "The paper boat", visualBible: "A folded white paper boat with a red sticker sail on a rainy cobblestone street at dusk. Puddles reflect warm shop-window light, visible rain streaks, handmade stop-motion texture.",
    referencePrompt: "Stop-motion still: folded white paper boat with a red sail floating in a puddle on a rainy cobblestone street at dusk, warm reflections",
    shots: ["drifts along a gutter stream; low tracking shot", "spins slowly in a puddle; top-down shot", "bumps against a curb and turns; close-up", "raindrops splash around it; static medium shot", "floats past a glowing shop window; lateral dolly", "slides under a small bridge of leaves; slow push in"] },
  { style: "anime", title: "Space station cat", subject: "The grey tabby cat", visualBible: "A grey tabby cat in a small white spacesuit with a clear dome helmet, inside a bright space station corridor with round windows showing Earth. Clean cel-shaded anime look, cool white and blue palette.",
    referencePrompt: "Anime still: grey tabby cat in a white spacesuit with a clear dome helmet floating in a bright space station corridor, round windows showing Earth",
    shots: ["floats along the corridor; tracking shot", "bats at a drifting wrench; medium close-up", "presses its paws against a window looking at Earth; over-the-shoulder shot", "spins slowly in zero gravity; static wide shot", "pushes off a wall toward the camera; low angle", "curls up to nap beside a console; slow pull back"] },
]);
export function canaryPlan(index) {
  const canary = CANARY_PLANS[index % CANARY_PLANS.length];
  return { style: canary.style, plan: { version: 1, title: canary.title, visualBible: canary.visualBible, referencePrompt: canary.referencePrompt,
    shots: canary.shots.map((action, shotIndex) => ({ index: shotIndex, durationSeconds: 5,
      prompt: `${canary.subject} ${action}.`,
      storyboardPrompt: `${canary.referencePrompt}, ${action.split(";")[0]}`.slice(0, 320),
      continuity: canary.visualBible.slice(0, 400) })) } };
}

export function signManifest(manifest, token) {
  const serialized = JSON.stringify(manifest);
  return { manifest, signature: crypto.createHmac("sha256", token).update(serialized).digest("base64url") };
}
