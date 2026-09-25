import assert from "node:assert/strict";
import test from "node:test";
import { flowDefinition } from "./flow";

const colors = ["#112233", "#445566", "#778899", "#AABBCC"];

test("Flow exposes the source editor's palette, defaults, and applicable controls", () => {
  assert.deepEqual(flowDefinition.colors, [
    "#EAF4FC", "#1E50A2", "#F09199", "#895B8A",
  ]);
  assert.equal(flowDefinition.type, "FLOW");
  assert.equal(flowDefinition.animated, true);
  assert.equal(flowDefinition.noise, 6);
  assert.equal(flowDefinition.soften, 0);
  assert.deepEqual(flowDefinition.defaults, {
    scale: 50, distortion: 60, swirl: 10, speed: 30, points: null,
  });
  assert.deepEqual(flowDefinition.controls.map(({ key }) => key), [
    "scale", "distortion", "swirl", "speed", "points",
  ]);
  for (const control of flowDefinition.controls.slice(0, 4)) {
    assert.deepEqual([control.kind, control.min, control.max, control.step], [
      "number", 0, 100, 1,
    ]);
  }
  const pointsControl = flowDefinition.controls[4];
  assert.ok(pointsControl);
  assert.equal(pointsControl.kind, "points");
});

test("Flow defaults preserve automatic spots and complete field parameters", () => {
  for (const input of [undefined, null, {}, "unsupported"]) {
    assert.deepEqual(flowDefinition.normalize(input, colors), {
      params: { scale: 50, distortion: 60, swirl: 10 },
      speed: 30,
      mesh: null,
    });
  }
});

test("Flow scalar controls clamp, round, and reject non-finite input", () => {
  const cases = [
    [{ scale: -5, distortion: 105, swirl: 19.6, speed: 0 },
      { scale: 0, distortion: 100, swirl: 20 }, 0],
    [{ scale: Number.NaN, distortion: Infinity, swirl: "90", speed: -1 },
      { scale: 50, distortion: 60, swirl: 10 }, 0],
  ] as const;

  for (const [input, params, speed] of cases) {
    const recipe = flowDefinition.normalize(input, colors);
    assert.deepEqual(recipe.params, params);
    assert.equal(recipe.speed, speed);
  }
});

test("Flow maps palette-aligned points to a copied, editor-bounded mesh", () => {
  const points = [[0, 50], [99, 100], [20, 35], [73, 28]];
  const options = { points, scale: 40, label: "untrusted", image: "https://invalid.test/image" };
  const recipe = flowDefinition.normalize(options, colors);

  assert.deepEqual(recipe.mesh, [[3, 50], [97, 97], [20, 35], [73, 28]]);
  assert.deepEqual(recipe.params, { scale: 40, distortion: 60, swirl: 10 });
  assert.deepEqual(points, [[0, 50], [99, 100], [20, 35], [73, 28]]);
  assert.notStrictEqual(recipe.mesh, points);
  assert.equal("label" in recipe, false);
  assert.equal("image" in recipe, false);
  assert.deepEqual(flowDefinition.normalize({ points: null }, colors).mesh, null);
});

test("Flow rejects malformed explicit spots rather than silently changing geometry", () => {
  const invalid = [
    [],
    [[20, 20]],
    [[20, 20], [30, 30], [40, 40], [50, Number.NaN]],
    [[20, 20], [30, 30], [40, 40], [50]],
    "20,20",
  ];

  for (const points of invalid) {
    assert.throws(() => flowDefinition.normalize({ points }, colors), /Flow points/);
  }
});
