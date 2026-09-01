import test from "node:test";
import assert from "node:assert/strict";
import { buildFairNodeMatch, FAIR_PRICE_MULTIPLIER } from "./fairScheduling.js";

test("automatic matching uses price-bounded owner-level fair share", () => {
  const { sql, params } = buildFairNodeMatch({
    gpusNeeded: 1,
    minVramGb: 8,
    deprioritizedOwnerIds: ["11111111-1111-1111-1111-111111111111"],
  });
  assert.deepEqual(params, [1, 8, ["11111111-1111-1111-1111-111111111111"]]);
  assert.match(sql, new RegExp(`\\* ${FAIR_PRICE_MULTIPLIER}`));
  assert.match(sql, /n\.price_per_hour <=/);
  assert.match(sql, /earning_node\.owner_id = n\.owner_id/);
  assert.match(sql, /n\.owner_id = ANY\(\$3::uuid\[\]\)/);
  assert.match(sql, /MAX\(owner_node\.last_job_assigned_at\)/);
  assert.match(sql, /ASC NULLS FIRST/);
  assert.match(sql, /FOR UPDATE OF n SKIP LOCKED/);
});

test("a renter-pinned node bypasses automatic fair-share ranking", () => {
  const { sql, params } = buildFairNodeMatch({
    gpusNeeded: 1,
    minVramGb: 8,
    nodeId: "chosen-node",
    deprioritizedOwnerIds: ["11111111-1111-1111-1111-111111111111"],
  });
  assert.deepEqual(params, [1, 8, "chosen-node"]);
  assert.doesNotMatch(sql, /billed_subtotal_usd/);
  assert.doesNotMatch(sql, /ANY/);
  assert.match(sql, /n\.id = \$3/);
});
