import crypto from "node:crypto";

export const MANIFEST_VERSION = 2;

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function deterministicSeed(jobId, retryCount = 0) {
  const digest = crypto.createHash("sha256").update(`${jobId}:${retryCount}`).digest();
  return digest.readUInt32BE(0);
}

export function hashInputs(envVars, inputs = []) {
  const normalized = {
    envVars: Object.fromEntries(Object.entries(envVars || {}).sort(([a], [b]) => a.localeCompare(b))),
    files: inputs.map((input) => ({ id: input.id, sha256: input.sha256, byteSize: input.byte_size }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
  return sha256(JSON.stringify(normalized));
}

export function signJobManifest(row, nodeId, agentToken, inputs, workload) {
  const issuedAt = new Date();
  const manifest = {
    version: MANIFEST_VERSION,
    jobId: row.id,
    nodeId,
    attempt: Number(row.retry_count || 0),
    issuedAt: issuedAt.toISOString(),
    expiresAt: new Date(issuedAt.getTime() + 60_000).toISOString(),
    seed: Number(row.deterministic_seed),
    inputHash: row.input_hash,
    execution: {
      workloadId: row.workload_id,
      dockerImage: row.docker_image,
      modelId: row.model_id,
      cacheKey: row.model_id,
      gpusNeeded: row.gpus_needed,
      maxRuntimeHours: Number(row.max_runtime_hours),
      envVars: row.env_vars,
    },
    inputs: inputs.map((input) => ({
      id: input.id,
      filename: input.filename,
      contentType: input.content_type,
      byteSize: input.byte_size,
      sha256: input.sha256,
    })),
    result: {
      schema: row.result_schema,
      required: workload.resultRequired === true,
      maxBytes: 15 * 1024 * 1024,
      allowedContentTypes: workload.allowedContentTypes || [],
    },
  };
  const serialized = JSON.stringify(manifest);
  const signature = crypto.createHmac("sha256", agentToken).update(serialized).digest("base64url");
  return { manifest, signature, manifestHash: sha256(serialized) };
}
