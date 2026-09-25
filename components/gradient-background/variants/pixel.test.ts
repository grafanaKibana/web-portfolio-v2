import assert from "node:assert/strict";
import test from "node:test";
import { pixelDefinition } from "./pixel";

const colors = ["#112233", "#44AA88"];

test("pixel preset maps editor defaults without touching palette geometry", () => {
  const recipe = pixelDefinition.normalize(undefined, colors);
  assert.deepEqual(recipe, {
    pixelStyle: "quilt",
    size: 40,
    speed: 30,
    cover: 50,
    rings: 12,
    weave: 20,
  });
  assert.deepEqual(colors, ["#112233", "#44AA88"]);
  assert.equal("stops" in recipe, false);
  assert.equal("divs" in recipe, false);
});

test("pixel styles map their distinct editor controls and defaults", () => {
  for (const [options, expected] of [
    [
      { style: "quilt", quilt: { steps: 9, weave: 28 } },
      { pixelStyle: "quilt", cover: 50, rings: 9, weave: 28 },
    ],
    [
      { style: "orbs", orbs: { gap: 7, roundness: 88, glow: 31 } },
      { pixelStyle: "orbs", cover: 7, rings: 88, weave: 31 },
    ],
    [
      { style: "glass", glass: { fill: 76 } },
      { pixelStyle: "glass", cover: 76, rings: 12, weave: 20 },
    ],
  ] as const) {
    const snapshot = structuredClone(options);
    const recipe = pixelDefinition.normalize(options, colors);
    for (const [key, value] of Object.entries(expected)) {
      assert.equal(recipe[key], value, `${options.style}: ${key}`);
    }
    assert.deepEqual(options, snapshot);
  }
});

test("pixel controls clamp and round to source slider bounds", () => {
  assert.deepEqual(
    pixelDefinition.normalize(
      {
        style: "orbs",
        size: 110,
        speed: -8,
        orbs: { gap: 100, roundness: -4, glow: 13.8 },
      },
      colors,
    ),
    {
      pixelStyle: "orbs",
      size: 100,
      speed: 0,
      cover: 30,
      rings: 0,
      weave: 14,
    },
  );
  assert.equal(pixelDefinition.normalize({ quilt: { steps: 1 } }, colors).rings, 2);
  assert.equal(pixelDefinition.normalize({ quilt: { steps: 99 } }, colors).rings, 16);
  assert.equal(pixelDefinition.normalize({ style: "glass", glass: { fill: 101 } }, colors).cover, 100);
});

test("pixel discards invalid scalar values and excludes untrusted extras", () => {
  const recipe = pixelDefinition.normalize(
    {
      style: "unknown",
      size: Number.POSITIVE_INFINITY,
      speed: "90",
      noise: Number.NaN,
      soften: 77,
      image: "https://example.invalid/a.png",
      quilt: { steps: "bad", weave: 200, text: "ignored" },
    },
    colors,
  );
  assert.equal(recipe.pixelStyle, "quilt");
  assert.equal(recipe.size, 40);
  assert.equal(recipe.speed, 30);
  assert.equal(recipe.rings, 12);
  assert.equal(recipe.weave, 100);
  assert.equal("grain" in recipe, false);
  assert.equal("blur" in recipe, false);
  assert.equal("image" in recipe, false);
  assert.equal("text" in recipe, false);
});

test("pixel retains inactive style edits without applying them", () => {
  const options = {
    style: "orbs",
    quilt: { steps: 6 },
    orbs: { gap: 7 },
    glass: { fill: 84 },
  };
  assert.equal(pixelDefinition.normalize(options, colors).rings, 100);
  assert.deepEqual(options, {
    style: "orbs",
    quilt: { steps: 6 },
    orbs: { gap: 7 },
    glass: { fill: 84 },
  });
});

test("pixel rejects malformed active style control groups", () => {
  for (const options of [{ quilt: [12] }, { style: "orbs", orbs: null }]) {
    assert.throws(() => pixelDefinition.normalize(options, colors), /Pixel .* options must/);
  }
});

test("pixel metadata exposes every style-specific editor control", () => {
  assert.deepEqual(
    pixelDefinition.controls.map(({ key }) => key),
    [
      "style",
      "size",
      "speed",
      "quilt.steps",
      "quilt.weave",
      "orbs.gap",
      "orbs.roundness",
      "orbs.glow",
      "glass.fill",
    ],
  );
});
