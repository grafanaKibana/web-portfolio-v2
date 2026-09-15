import assert from "node:assert/strict";
import test from "node:test";

import { nextDescriptorIndex } from "./descriptor-sequence";

test("descriptor sequences keep zero and one item stable", () => {
  assert.equal(nextDescriptorIndex(0, 0), 0);
  assert.equal(nextDescriptorIndex(0, 1), 0);
});

test("descriptor sequences advance and wrap for multiple items", () => {
  assert.deepEqual(
    [0, 1, 2].map((index) => nextDescriptorIndex(index, 3)),
    [1, 2, 0],
  );
});
