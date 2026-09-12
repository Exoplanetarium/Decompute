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
