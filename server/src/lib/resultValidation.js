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
