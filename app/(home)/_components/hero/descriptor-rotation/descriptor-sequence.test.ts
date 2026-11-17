import assert from "node:assert/strict";
import test from "node:test";

import { descriptorDwell, nextDescriptorIndex, resolveDescriptorMotion } from "./descriptor-sequence";

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
  const motion = resolveDescriptorMotion(true, true);

  assert.equal(motion.transition.duration, 0.12);
  assert.deepEqual(motion.initial, { opacity: 0 });
  assert.deepEqual(motion.animate, { opacity: 1 });
  assert.deepEqual(motion.exit, { opacity: 0 });
});

/**
 * Reads when the incoming phrase starts to appear.
 *
 * @param growing - Whether the incoming phrase is wider than the outgoing one.
 * @returns The entry delay in seconds.
 */
function entryDelay(growing: boolean): number {
  const { animate } = resolveDescriptorMotion(false, growing);
  return "transition" in animate ? animate.transition.delay : Number.NaN;
}

test("standard descriptor motion clears the outgoing phrase before the incoming one appears", () => {
  const { exit } = resolveDescriptorMotion(false, false);
  const exitDuration = "transition" in exit ? exit.transition.duration : Number.NaN;

  assert.ok(exitDuration <= entryDelay(false));
});

test("a wider incoming phrase waits longer so the slot opens first", () => {
  assert.ok(entryDelay(true) > entryDelay(false));
});

test("the lead phrase opens at the base interval and holds longer on every return", () => {
  const dwells = [0, 1, 2, 3].map((index) => descriptorDwell(index, 1_000, false));

  assert.equal(descriptorDwell(0, 1_000, true), 1_000);
  assert.ok(dwells.slice(1).every((dwell) => dwell === 1_000));
  assert.ok(dwells[0] !== undefined && dwells[0] > 1_000);
});
