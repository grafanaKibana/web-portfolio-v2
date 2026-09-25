import assert from "node:assert/strict";
import test from "node:test";

import { stillDefinition } from "./still";

const colors = ["#123456", "#ABCDEF"] as const;

test("Still keeps the static editor preset, not the renderer fallback", () => {
  assert.equal(stillDefinition.type, "SMESH");
  assert.equal(stillDefinition.animated, false);
  assert.equal(stillDefinition.noise, 6);
  assert.equal(stillDefinition.soften, 0);
  assert.deepEqual(stillDefinition.colors, [
    "#FFF7F5", "#FFDDE4", "#FFB7C9", "#E98FB4", "#B76AA0", "#7A4E86",
  ]);
  assert.deepEqual(stillDefinition.normalize(undefined, colors), {
    params: {
      positions: 22,
      mixing: 78,
      rotation: 340,
      grain: 0,
      waveX: 95,
      waveXShift: 10,
      waveY: 100,
      waveYShift: 45,
    },
  });
});

test("Still maps every public dial to its source recipe field", () => {
  const options = {
    positions: 37,
    mixing: 65,
    rotation: 120,
    grainMix: 12,
    waveX: 70,
    waveXShift: 25,
    waveY: 85,
    waveYShift: 40,
    noise: 99,
    soften: 80,
    label: "ignored",
  };
  const original = structuredClone(options);

  assert.deepEqual(stillDefinition.normalize(options, colors), {
    params: {
      positions: 37,
      mixing: 65,
      rotation: 120,
      grain: 12,
      waveX: 70,
      waveXShift: 25,
      waveY: 85,
      waveYShift: 40,
    },
  });
  assert.deepEqual(options, original);
  assert.deepEqual(colors, ["#123456", "#ABCDEF"]);
});

test("Still bounds and quantizes all step-one controls", () => {
  const cases = [
    ["positions", "positions", 22, 100],
    ["mixing", "mixing", 78, 100],
    ["rotation", "rotation", 340, 360],
    ["grainMix", "grain", 0, 100],
    ["waveX", "waveX", 95, 100],
    ["waveXShift", "waveXShift", 10, 100],
    ["waveY", "waveY", 100, 100],
    ["waveYShift", "waveYShift", 45, 100],
  ] as const;

  for (const [publicKey, recipeKey, fallback, max] of cases) {
    for (const [value, expected] of [
      [-1, 0],
      [max + 1, max],
      [12.6, 13],
      [Number.NaN, fallback],
      ["40", fallback],
    ] as const) {
      const params = stillDefinition.normalize({ [publicKey]: value }, colors).params as Record<string, number>;
      assert.equal(params[recipeKey], expected, `${publicKey}: ${String(value)}`);
    }
  }
});

test("Still controls expose only source-backed numeric dials", () => {
  assert.deepEqual(
    stillDefinition.controls.map(({ key, kind, min, max, step }) => [key, kind, min, max, step]),
    [
      ["positions", "number", 0, 100, 1],
      ["mixing", "number", 0, 100, 1],
      ["rotation", "number", 0, 360, 1],
      ["grainMix", "number", 0, 100, 1],
      ["waveX", "number", 0, 100, 1],
      ["waveXShift", "number", 0, 100, 1],
      ["waveY", "number", 0, 100, 1],
      ["waveYShift", "number", 0, 100, 1],
    ],
  );
});
