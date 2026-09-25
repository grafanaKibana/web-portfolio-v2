import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGradient } from "./gradient-background.helpers";

test("normalizeGradient builds a canonical recipe without mutating input", () => {
  const input = {
    variant: "flow",
    colors: ["#abc", "#102030", "#FEDCBA"],
    balance: [0, 1],
    noise: 23,
    soften: 7,
    animated: true,
    options: { swirl: 17, scale: 40, speed: 21, distortion: 52 },
  } as const;
  const snapshot = structuredClone(input);
  const normalized = normalizeGradient(input);

  assert.deepEqual(input, snapshot);
  assert.deepEqual(normalized.recipe.stops, ["#AABBCC", "#102030", "#FEDCBA"]);
  assert.deepEqual(normalized.recipe.divs, [0.05, 0.95]);
  assert.equal(normalized.recipe.grain, 23);
  assert.equal(normalized.recipe.blur, 7);
  assert.equal(normalized.recipe.fieldBlur, 7);
  assert.equal(normalized.speed, 21);
  assert.equal(normalized.paused, false);
});

test("normalizeGradient rejects invalid variants and palettes before rendering", () => {
  for (const variant of ["toString", "__proto__", "unknown"]) {
    assert.throws(
      () => normalizeGradient({ variant }),
      /Unknown gradient variant/,
    );
  }

  for (const colors of [
    ["#000000"],
    Array.from({ length: 7 }, () => "#000000"),
    ["red", "#000000"],
  ]) {
    assert.throws(
      () => normalizeGradient({ variant: "flow", colors }),
      /[Gg]radient color/,
    );
  }
});

test("normalization identity ignores playback while tracking visual changes", () => {
  const first = normalizeGradient({
    variant: "flow",
    options: { scale: 30, speed: 10, distortion: 40 },
    animated: true,
  });
  const playbackChange = normalizeGradient({
    variant: "flow",
    options: { distortion: 40, speed: 90, scale: 30 },
    animated: false,
  });
  const visualChange = normalizeGradient({
    variant: "flow",
    options: { scale: 31, speed: 10, distortion: 40 },
  });

  assert.equal(first.identity, playbackChange.identity);
  assert.notEqual(first.speed, playbackChange.speed);
  assert.notEqual(first.paused, playbackChange.paused);
  assert.notEqual(first.identity, visualChange.identity);
});

test("shared finish props override variant-local recipe fields", () => {
  const normalized = normalizeGradient({
    variant: "pixel",
    noise: 44,
    soften: 18,
    options: { style: "quilt", quilt: { steps: 8 } },
  });

  assert.equal(normalized.recipe.grain, 44);
  assert.equal(normalized.recipe.blur, 18);
  assert.equal(normalized.recipe.fieldBlur, 18);
});
