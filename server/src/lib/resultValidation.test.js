import test from "node:test";
import assert from "node:assert/strict";
import { sha256 } from "./jobManifest.js";
import { validateArtifact } from "./resultValidation.js";

test("validates structured embedding results and their digest", () => {
  const data = Buffer.from(JSON.stringify({ schemaVersion: 1, kind: "embeddings", model: "test", dimensions: 2,
    items: [{ index: 0, textHash: "a".repeat(64), embedding: [0.25, -0.5] }] }));
  const result = validateArtifact({ schema: "decompute.embeddings.v1", contentType: "application/json", data,
    claimedHash: sha256(data), allowedContentTypes: ["application/json"] });
  assert.equal(result.metadata.dimensions, 2);
});

test("rejects a result whose claimed digest is false", () => {
  const data = Buffer.from("not an image");
  assert.throws(() => validateArtifact({ schema: "decompute.image.v1", contentType: "image/png", data,
    claimedHash: "0".repeat(64), allowedContentTypes: ["image/png"] }), /SHA-256/);
});

function dockingArtifact(items) {
  const data = Buffer.from(JSON.stringify({ schemaVersion: 1, kind: "docking", target: "AChE-4EY7", items }));
  return { schema: "decompute.docking.v1", contentType: "application/json", data,
    claimedHash: sha256(data), allowedContentTypes: ["application/json"] };
}

test("validates docking results, counting failed molecules without rejecting the batch", () => {
  const result = validateArtifact(dockingArtifact([
    { index: 0, smiles: "CCO", smilesHash: sha256("CCO"), score: -3.1, pose: "MODEL 1\nENDMDL\n" },
    { index: 1, smiles: "C1CC", smilesHash: sha256("C1CC"), error: "Chem.MolFromSmiles failed" },
  ]));
  assert.deepEqual(result.metadata, { kind: "docking", itemCount: 2, dockedCount: 1, failedCount: 1, bestScore: -3.1 });
});

test("rejects docking items whose hash does not match their SMILES", () => {
  assert.throws(() => validateArtifact(dockingArtifact([
    { index: 0, smiles: "CCO", smilesHash: sha256("CCN"), score: -3.1, pose: "MODEL 1\n" },
  ])), /identity/);
});

test("rejects docking scores outside anything Vina reports", () => {
  assert.throws(() => validateArtifact(dockingArtifact([
    { index: 0, smiles: "CCO", smilesHash: sha256("CCO"), score: -999, pose: "MODEL 1\n" },
  ])), /pose item/);
});
