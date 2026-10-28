import assert from "node:assert/strict";
import test from "node:test";
import { clampDelta, MAX_FRAME_DELTA } from "./time.js";

test("clampDelta caps long frames and rejects invalid values", () => {
  assert.equal(clampDelta(0.016), 0.016);
  assert.equal(clampDelta(30), MAX_FRAME_DELTA);
  assert.equal(clampDelta(-1), 0);
  assert.equal(clampDelta(NaN), 0);
});
