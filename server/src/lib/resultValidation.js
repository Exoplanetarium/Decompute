import { sha256 } from "./jobManifest.js";

function isFiniteVector(value) {
  return Array.isArray(value) && value.length > 0 && value.length <= 4096
    && value.every((n) => Number.isFinite(n));
}

function validateJson(schema, data) {
  let parsed;
  try { parsed = JSON.parse(data.toString("utf8")); }
  catch { throw new Error("Result is not valid JSON"); }

  if (parsed?.schemaVersion !== 1) throw new Error("Unsupported result schemaVersion");
  if (schema === "decompute.transcription.v1") {
    if (parsed.kind !== "transcription" || typeof parsed.text !== "string" || parsed.text.length > 2_000_000) {
      throw new Error("Invalid transcription result");
    }
    if (!Array.isArray(parsed.segments) || parsed.segments.length > 100_000 || parsed.segments.some((s) =>
      !Number.isFinite(s?.start) || !Number.isFinite(s?.end) || s.start < 0 || s.end < s.start || typeof s.text !== "string")) {
      throw new Error("Invalid transcription segments");
    }
    return { kind: parsed.kind, segmentCount: parsed.segments.length, characterCount: parsed.text.length };
  }
  if (schema === "decompute.embeddings.v1") {
    if (parsed.kind !== "embeddings" || !Number.isInteger(parsed.dimensions) || parsed.dimensions < 1 || parsed.dimensions > 4096
      || !Array.isArray(parsed.items) || parsed.items.length < 1 || parsed.items.length > 1024
      || parsed.items.some((item) => !isFiniteVector(item?.embedding) || item.embedding.length !== parsed.dimensions
        || typeof item.textHash !== "string" || !/^[a-f0-9]{64}$/.test(item.textHash))) {
      throw new Error("Invalid embeddings result");
    }
    return { kind: parsed.kind, itemCount: parsed.items.length, dimensions: parsed.dimensions, model: String(parsed.model || "").slice(0, 200) };
  }
  if (schema === "decompute.docking.v1") {
    // Shape only. Whether each molecule was one the job actually sent, and
    // whether its score is honest (re-scoring the returned pose), are
    // separate checks layered on top of this.
    if (parsed.kind !== "docking" || !Array.isArray(parsed.items) || parsed.items.length < 1 || parsed.items.length > 10_000) {
      throw new Error("Invalid docking result");
    }
    let docked = 0;
    let bestScore = null;
    for (const [position, item] of parsed.items.entries()) {
      // Says which molecule and which check, so a rejection in the logs can
      // be traced back to the library line that caused it.
      const problem = !Number.isInteger(item?.index) || item.index < 0 ? "bad index"
        : typeof item.smiles !== "string" || item.smiles.length < 1 ? "missing SMILES"
        : item.smiles.length > 2000 ? `SMILES is ${item.smiles.length} characters`
        : item.smilesHash !== sha256(Buffer.from(item.smiles, "utf8")) ? "smilesHash doesn't match SMILES"
        : null;
      if (problem) {
        throw new Error(`Invalid docking item identity (item ${position}: ${problem}; SMILES starts ${JSON.stringify(String(item?.smiles ?? "").slice(0, 40))})`);
      }
      if (typeof item.error === "string") {
        if (item.error.length > 1000 || "score" in item || "pose" in item) throw new Error("Invalid docking failure item");
        continue;
      }
      // Vina reports roughly -20..0 kcal/mol for real binders; positive
      // values mean steric clashes. Anything far outside is not a Vina score.
      if (!Number.isFinite(item.score) || item.score < -30 || item.score > 30
        || typeof item.pose !== "string" || item.pose.length > 200_000 || !item.pose.startsWith("MODEL")) {
        throw new Error("Invalid docking pose item");
      }
      docked += 1;
      if (bestScore === null || item.score < bestScore) bestScore = item.score;
    }
    return { kind: parsed.kind, itemCount: parsed.items.length, dockedCount: docked, failedCount: parsed.items.length - docked, bestScore };
  }
  throw new Error(`No JSON validator for ${schema}`);
}

export function validateArtifact({ schema, contentType, data, claimedHash, allowedContentTypes = [] }) {
  if (!Buffer.isBuffer(data) || data.length === 0) throw new Error("Empty artifact body");
  if (!allowedContentTypes.includes(contentType)) throw new Error(`Content type ${contentType} is not allowed for this workload`);
  const actualHash = sha256(data);
  if (!/^[a-f0-9]{64}$/.test(String(claimedHash || "")) || claimedHash !== actualHash) {
    throw new Error("Artifact SHA-256 does not match the agent's result report");
  }

  let metadata;
  if (schema === "decompute.image.v1") {
    const png = data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpeg = data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
    const webp = data.length >= 12 && data.subarray(0, 4).toString() === "RIFF" && data.subarray(8, 12).toString() === "WEBP";
    const zip = data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b && [0x03, 0x05, 0x07].includes(data[2]);
    if (!png && !jpeg && !webp && !zip) throw new Error("Image result has an invalid file signature");
    metadata = { kind: "image", format: png ? "png" : jpeg ? "jpeg" : webp ? "webp" : "zip" };
  } else {
    metadata = validateJson(schema, data);
  }
  return { sha256: actualHash, byteSize: data.length, metadata };
}
