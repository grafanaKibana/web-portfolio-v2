import assert from "node:assert/strict";
import test from "node:test";

import { radialDefinition } from "./radial";

test("radial maps the editor preset and remains static", () => {
  assert.equal(radialDefinition.type, "CIRCLE");
  assert.equal(radialDefinition.label, "Radial");
  assert.equal(radialDefinition.animated, false);
  assert.deepEqual(radialDefinition.colors, [
    "#EAF4FC",
    "#A2D7DD",
    "#4C6CB3",
    "#181B3A",
  ]);
  assert.equal(radialDefinition.noise, 12);
  assert.equal(radialDefinition.soften, 10);
});

test("radial exposes no unsupported origin, radius, motion, or other controls", () => {
  assert.deepEqual(radialDefinition.defaults, {});
  assert.deepEqual(radialDefinition.controls, []);
});

test("radial ignores variant-only input without copying it into the recipe", () => {
  const cases: { options: unknown; colors: string[] }[] = [
    { options: null, colors: ["#123456", "#DDEEFF"] },
    {
      options: { origin: [0.1, 0.9], radius: 2, text: "not a control" },
      colors: ["#123456", "#6699CC", "#F0C080"],
    },
    {
      options: ["not", "radial", "options"],
      colors: ["#111111", "#333333", "#555555", "#777777", "#999999", "#BBBBBB"],
    },
  ];

  for (const { options, colors } of cases) {
    const originalOptions = structuredClone(options);
    const originalColors = [...colors];

    assert.deepEqual(radialDefinition.normalize(options, colors), {});
    assert.deepEqual(options, originalOptions);
    assert.deepEqual(colors, originalColors);
  }
});
