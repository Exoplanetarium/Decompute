import test from "node:test";
import assert from "node:assert/strict";
import { summarizeVerification } from "./dockingVerifier.js";

test("accepts a chunk when every docked molecule re-scores the same", () => {
  const items = [
    { index: 0, ok: true, reported: -11.199, rescored: -11.198 },
    { index: 2, ok: true, reported: -8.766, rescored: -8.766 },
  ];
  assert.deepEqual(summarizeVerification(items, 2), { ok: true, checked: 2, maxScoreGap: 0.001 });
});

test("rejects the whole chunk over one faked score", () => {
  const items = [
    { index: 0, ok: false, reported: -15, rescored: -11.198 },
    { index: 2, ok: true, reported: -8.766, rescored: -8.766 },
  ];
  const verdict = summarizeVerification(items, 2);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /1 of 2 molecules failed re-scoring \(index 0\)/);
});

test("rejects a chunk when the verifier didn't check every docked molecule", () => {
  const verdict = summarizeVerification([{ index: 0, ok: true, reported: -9, rescored: -9 }], 2);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /checked 1 of 2/);
});
