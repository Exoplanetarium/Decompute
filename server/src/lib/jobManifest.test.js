import test from "node:test";
import assert from "node:assert/strict";
import { deterministicSeed, hashInputs } from "./jobManifest.js";

test("job seeds and input hashes are deterministic", () => {
  assert.equal(deterministicSeed("same-job", 0), deterministicSeed("same-job", 0));
  assert.notEqual(deterministicSeed("same-job", 0), deterministicSeed("same-job", 1));
  assert.equal(
    hashInputs({ B: "2", A: "1" }, [{ id: "b", sha256: "2", byte_size: 2 }, { id: "a", sha256: "1", byte_size: 1 }]),
    hashInputs({ A: "1", B: "2" }, [{ id: "a", sha256: "1", byte_size: 1 }, { id: "b", sha256: "2", byte_size: 2 }]),
  );
});
