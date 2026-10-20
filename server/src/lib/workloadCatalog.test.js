import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { getWorkload, sanitizeWorkloadInputs } from "./workloadCatalog.js";

test("the development image workload is server-resolved", () => {
  const workload = getWorkload("image-generation");
  assert.equal(workload.image, "decompute/image-gen:local");
  assert.equal(getWorkload("custom"), null);
});

test("unrecognized environment variables and unit fields are removed", () => {
  const workload = getWorkload("image-generation");
  const result = sanitizeWorkloadInputs(
    workload,
    { DECOMPUTE_PROMPTS: "cat", HOME: "/host", AWS_SECRET_ACCESS_KEY: "secret" },
    [{ DECOMPUTE_PROMPTS: "cat", MALICIOUS_OPTION: "yes" }],
  );
  assert.deepEqual(result.envVars, { DECOMPUTE_PROMPTS: "cat" });
  assert.deepEqual(result.units, [{ DECOMPUTE_PROMPTS: "cat" }]);
});

test("mutable registry tags are rejected", () => {
  const script = `import('./src/lib/workloadCatalog.js').then(m => m.getWorkload('image-generation'))`;
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "production",
      DECOMPUTE_WORKLOAD_IMAGES: JSON.stringify({ "image-generation": "registry.example/image:latest" }),
    },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /immutable image@sha256 digest/);
});

test("video workloads cannot be launched as generic jobs even when their images are configured", () => {
  const script = `import('./src/lib/workloadCatalog.js').then(m => console.log(JSON.stringify([m.getWorkload('video-generation'), m.getWorkload('video-reference'), m.listWorkloads().map(w => w.id)])))`;
  const digest = "@sha256:" + "a".repeat(64);
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
    cwd: process.cwd(),
    env: { ...process.env, DECOMPUTE_WORKLOAD_IMAGES: JSON.stringify({ "video-generation": `r.example/v${digest}`, "video-reference": `r.example/r${digest}` }) },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const [generation, reference, listed] = JSON.parse(result.stdout);
  assert.equal(generation, null);
  assert.equal(reference, null);
  assert.ok(!listed.includes("video-generation") && !listed.includes("video-reference"));
});
