import test from "node:test";
import assert from "node:assert/strict";
import { VideoModels, planMaxOutput, REVIEW_MAX_OUTPUT } from "./models.js";

// A scripted stand-in for the Gemini endpoint: each call takes the next
// response, and every request is recorded for inspection.
function fakeFetch(responses) {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return { ok: next.status === 200, status: next.status, json: async () => next.body };
  };
  return { fetchImpl, requests };
}
const answer = (data, { finishReason = "STOP", text = JSON.stringify(data), usage = { promptTokenCount: 1000, candidatesTokenCount: 100, thoughtsTokenCount: 50 } } = {}) =>
  ({ status: 200, body: { candidates: [{ finishReason, content: { parts: [{ text: "thinking…", thought: true }, { text }] } }], usageMetadata: usage } });
const plan = (shots) => ({ title: "Garden robot", visualBible: "A small orange robot in a sunny garden.", referencePrompt: "Orange robot standing in a garden",
  shots: Array.from({ length: shots }, () => ({ prompt: "The robot waves at the camera.", storyboardPrompt: "Orange robot waving in a garden", continuity: "Orange metal body" })) });
const request = { prompt: "An orange robot waves in a garden", durationSeconds: 30, style: "3d" };

test("planner requests carry the schema and a thinking-inclusive token cap, at the default temperature", async () => {
  const { fetchImpl, requests } = fakeFetch([answer(plan(6))]);
  const result = await new VideoModels({ apiKey: "k", fetchImpl }).plan(request);
  assert.equal(result.plan.shots.length, 6);
  assert.equal(result.costMicros, Math.ceil(1000 * 0.25 + 150 * 1.5), "thought tokens are billed as output");
  const [{ url, headers, body }] = requests;
  assert.match(url, /gemini-3\.1-flash-lite:generateContent$/);
  assert.equal(headers["x-goog-api-key"], "k");
  assert.equal(body.generationConfig.maxOutputTokens, planMaxOutput(6));
  assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, "minimal");
  assert.equal(body.generationConfig.responseJsonSchema.properties.shots.minItems, 6);
  assert.equal("temperature" in body.generationConfig, false);
});

test("the planner repairs once using the validation error, then gives up with the cost of both calls", async () => {
  const { fetchImpl, requests } = fakeFetch([answer(plan(5)), answer(plan(6))]);
  const result = await new VideoModels({ apiKey: "k", fetchImpl }).plan(request);
  assert.equal(result.plan.shots.length, 6);
  assert.match(requests[1].body.contents[0].parts[0].text, /Repair this validation issue: Return exactly 6 shots/);
  const failing = fakeFetch([answer(plan(5)), answer(plan(4))]);
  await assert.rejects(new VideoModels({ apiKey: "k", fetchImpl: failing.fetchImpl }).plan(request),
    (error) => error.status === 422 && !error.retryable && error.costMicros === 2 * Math.ceil(1000 * 0.25 + 150 * 1.5));
});

test("rate limits, outages and lost connections are retryable; rejected requests are not", async () => {
  const outcome = async (response) => {
    const { fetchImpl } = fakeFetch([response]);
    try { await new VideoModels({ apiKey: "k", fetchImpl }).plan(request); } catch (error) { return error.retryable; }
  };
  assert.equal(await outcome({ status: 429, body: {} }), true);
  assert.equal(await outcome({ status: 503, body: {} }), true);
  assert.equal(await outcome(new TypeError("fetch failed")), true);
  assert.equal(await outcome({ status: 400, body: {} }), false);
});

test("a malformed review gets one retry and both calls are costed", async () => {
  const reviewArgs = { spec: { prompt: "robot" }, reference: Buffer.from("ref"), frames: [Buffer.from("a"), Buffer.from("b")], kind: "shot" };
  const { fetchImpl, requests } = fakeFetch([answer(null, { text: "not json" }), answer({ accepted: true, reason: "Same robot and garden" })]);
  const review = await new VideoModels({ apiKey: "k", fetchImpl }).review(reviewArgs);
  assert.equal(review.accepted, true);
  assert.equal(review.costMicros, 2 * Math.ceil(1000 * 0.25 + 150 * 1.5));
  assert.equal(requests[0].body.generationConfig.maxOutputTokens, REVIEW_MAX_OUTPUT);
  assert.equal(requests[0].body.contents[0].parts.filter((p) => p.inlineData).length, 3);
  const twice = fakeFetch([answer(null, { finishReason: "MAX_TOKENS" }), answer({ accepted: "yes" })]);
  await assert.rejects(new VideoModels({ apiKey: "k", fetchImpl: twice.fetchImpl }).review(reviewArgs),
    (error) => error.status === 422 && error.costMicros === 2 * Math.ceil(1000 * 0.25 + 150 * 1.5));
  const outage = fakeFetch([{ status: 500, body: {} }]);
  await assert.rejects(new VideoModels({ apiKey: "k", fetchImpl: outage.fetchImpl }).review(reviewArgs), (error) => error.retryable === true);
  assert.equal(outage.requests.length, 1, "transient failures wait for the next tick rather than retrying inline");
});

test("without a key, planning reports itself unconfigured instead of calling out", async () => {
  const { fetchImpl, requests } = fakeFetch([]);
  await assert.rejects(new VideoModels({ apiKey: "", fetchImpl }).plan(request), /not configured/);
  assert.equal(requests.length, 0);
});
