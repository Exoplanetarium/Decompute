// The server, not the renter, chooses executable images. Production images
// must be pinned by digest so an allowlisted tag cannot later be replaced with
// different code. Local development keeps the one working template usable.
const production = process.env.NODE_ENV === "production";
const configuredImages = (() => {
  if (!process.env.DECOMPUTE_WORKLOAD_IMAGES) return {};
  try {
    const value = JSON.parse(process.env.DECOMPUTE_WORKLOAD_IMAGES);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    throw new Error("DECOMPUTE_WORKLOAD_IMAGES must be a JSON object mapping workload IDs to image references");
  }
})();

const definitions = {
  "image-generation": {
    defaultImage: production ? null : "decompute/image-gen:local",
    gpusNeeded: 1,
    minVramGb: 8,
    defaultRuntimeHours: 0.25,
    maxRuntimeHours: 1,
    envKeys: new Set(["DECOMPUTE_PROMPTS", "DECOMPUTE_MODEL", "DECOMPUTE_COUNT_PER_PROMPT"]),
    unitKeys: new Set(["DECOMPUTE_PROMPTS", "DECOMPUTE_COUNT_PER_PROMPT"]),
  },
  "llm-finetune": {
    gpusNeeded: 1, minVramGb: 24, defaultRuntimeHours: 6, maxRuntimeHours: 12,
    envKeys: new Set(["DECOMPUTE_BASE_MODEL", "DECOMPUTE_EPOCHS"]), unitKeys: new Set(),
  },
  "train-classifier": {
    gpusNeeded: 1, minVramGb: 12, defaultRuntimeHours: 3, maxRuntimeHours: 6,
    envKeys: new Set(["DECOMPUTE_DATA_TYPE", "DECOMPUTE_TEST_SPLIT"]), unitKeys: new Set(),
  },
  "transcribe-audio": {
    gpusNeeded: 1, minVramGb: 8, defaultRuntimeHours: 2, maxRuntimeHours: 4,
    envKeys: new Set(["DECOMPUTE_LANGUAGE", "DECOMPUTE_INCLUDE_TIMESTAMPS"]), unitKeys: new Set(),
  },
  "video-generation": {
    gpusNeeded: 1, minVramGb: 40, defaultRuntimeHours: 2, maxRuntimeHours: 4,
    envKeys: new Set(["DECOMPUTE_PROMPT", "DECOMPUTE_DURATION", "DECOMPUTE_STYLE"]), unitKeys: new Set(),
  },
};

const digestPattern = /@sha256:[a-f0-9]{64}$/i;

export function getWorkload(workloadId) {
  const definition = definitions[workloadId];
  if (!definition) return null;
  const configured = configuredImages[workloadId];
  const image = typeof configured === "string" && configured.trim()
    ? configured.trim()
    : definition.defaultImage;
  if (!image) return null;
  const localDevelopmentImage = !production
    && workloadId === "image-generation"
    && image === "decompute/image-gen:local";
  if (!localDevelopmentImage && !digestPattern.test(image)) {
    throw new Error(`Workload ${workloadId} must use an immutable image@sha256 digest`);
  }
  return { id: workloadId, image, ...definition };
}

export function listWorkloads() {
  return Object.keys(definitions).flatMap((id) => {
    const workload = getWorkload(id);
    return workload ? [{ id, gpusNeeded: workload.gpusNeeded, minVramGb: workload.minVramGb }] : [];
  });
}

function copyAllowedValues(input, allowedKeys, maxKeys) {
  const output = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return output;
  for (const [rawKey, rawValue] of Object.entries(input).slice(0, maxKeys)) {
    const key = String(rawKey);
    if (!allowedKeys.has(key)) continue;
    output[key] = String(rawValue).slice(0, 2000);
  }
  return output;
}

export function sanitizeWorkloadInputs(workload, envVarsInput, unitsInput) {
  const envVars = copyAllowedValues(envVarsInput, workload.envKeys, 50);
  const units = Array.isArray(unitsInput)
    ? unitsInput.slice(0, 64).map((unit) => copyAllowedValues(unit, workload.unitKeys, 10))
    : null;
  return { envVars, units };
}
