import assert from "node:assert/strict";
import test from "node:test";

import {
  descriptorDwell,
  nextDescriptorIndex,
  reducedDescriptorMotion,
  resolveDescriptorReel,
} from "./descriptor-sequence";

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
  assert.equal(reducedDescriptorMotion.transition.duration, 0.12);
  assert.deepEqual(reducedDescriptorMotion.initial, { opacity: 0 });
  assert.deepEqual(reducedDescriptorMotion.animate, { opacity: 1 });
  assert.deepEqual(reducedDescriptorMotion.exit, { opacity: 0 });
});

/**
 * Reads when a letter of the incoming phrase starts to roll in.
 *
 * @param growing - Whether the incoming phrase is wider than the outgoing one.
 * @param progress - Position of the letter through the phrase, from 0 to 1.
 * @returns The entry delay in seconds.
 */
function entryDelay(growing: boolean, progress: number): number {
  return resolveDescriptorReel(growing).animate(progress).transition.delay;
}

test("a wider incoming phrase waits longer so the slot opens first", () => {
  assert.ok(entryDelay(true, 0) > entryDelay(false, 0));
});

test("letters enter in reading order within a fixed window, whatever the phrase length", () => {
  const delays = [0, 0.5, 1].map((progress) => entryDelay(false, progress));

  assert.deepEqual(delays, [...delays].sort((first, second) => first - second));
  assert.ok(entryDelay(false, 1) - entryDelay(false, 0) < 0.4);
});

test("the lead phrase opens at the base interval and holds longer on every return", () => {
  const dwells = [0, 1, 2, 3].map((index) => descriptorDwell(index, 1_000, false));

  assert.equal(descriptorDwell(0, 1_000, true), 1_000);
  assert.ok(dwells.slice(1).every((dwell) => dwell === 1_000));
  assert.ok(dwells[0] !== undefined && dwells[0] > 1_000);
});
