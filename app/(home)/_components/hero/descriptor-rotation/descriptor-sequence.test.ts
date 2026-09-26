import assert from "node:assert/strict";
import test from "node:test";

import { nextDescriptorIndex, resolveDescriptorMotion } from "./descriptor-sequence";

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

test("reduced descriptor motion stays brief and removes translation", () => {
  const motion = resolveDescriptorMotion(true);

  assert.equal(motion.transition.duration, 0.12);
  assert.deepEqual(motion.initial, { opacity: 0 });
  assert.deepEqual(motion.animate, { opacity: 1 });
  assert.deepEqual(motion.exit, { opacity: 0 });
});

test("standard descriptor motion preserves directional continuity", () => {
  const motion = resolveDescriptorMotion(false);

  assert.deepEqual(motion.initial, { opacity: 0, y: "0.875rem" });
  assert.deepEqual(motion.animate, { opacity: 1, y: "0rem" });
  assert.deepEqual(motion.exit, { opacity: 0, y: "-0.875rem" });
});
