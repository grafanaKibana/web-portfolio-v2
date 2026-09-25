import assert from "node:assert/strict";
import test from "node:test";
import { skyDefinition } from "./sky";

const colors = ["#112233", "#445566", "#778899", "#AABBCC"];

test("Sky exposes source palette, defaults, and applicable controls", () => {
  assert.equal(skyDefinition.type, "SKY");
  assert.equal(skyDefinition.animated, true);
  assert.deepEqual(skyDefinition.colors, [
    "#E6F2FF", "#B3D9FF", "#80B3FF", "#6699E6",
  ]);
  assert.equal(skyDefinition.noise, 4);
  assert.equal(skyDefinition.soften, 0);
  assert.deepEqual(skyDefinition.defaults, {
    scale: 45, warp: 50, wind: 40, speed: 22, direction: "up",
  });
  assert.deepEqual(skyDefinition.controls.map(({ key }) => key), [
    "scale", "warp", "wind", "speed", "direction",
  ]);
  for (const control of skyDefinition.controls.slice(0, 4)) {
    assert.deepEqual([control.kind, control.min, control.max, control.step], [
      "number", 0, 100, 1,
    ]);
  }
  assert.deepEqual(skyDefinition.controls[4], {
    key: "direction",
    label: "Weather direction",
    kind: "select",
    choices: ["up", "right", "down", "left"],
  });
});

test("Sky normalizes source editor defaults without unrelated recipe fields", () => {
  for (const input of [undefined, null, {}, "unsupported"]) {
    assert.deepEqual(skyDefinition.normalize(input, colors), {
      params: { scale: 45, distortion: 50, swirl: 40, dir: 0 },
      speed: 22,
    });
  }
});

test("Sky clamps and rounds scalar controls, falling back for invalid values", () => {
  const cases = [
    [
      { scale: -1, warp: 101, wind: 34.6, speed: 17.5 },
      { scale: 0, distortion: 100, swirl: 35, dir: 0 },
      18,
    ],
    [
      { scale: NaN, warp: Infinity, wind: "90", speed: -12 },
      { scale: 45, distortion: 50, swirl: 40, dir: 0 },
      0,
    ],
  ] as const;

  for (const [options, params, speed] of cases) {
    const recipe = skyDefinition.normalize(options, colors);
    assert.deepEqual(recipe.params, params);
    assert.equal(recipe.speed, speed);
  }
});

test("Sky maps each direction to a quarter turn and ignores invalid directions", () => {
  for (const [direction, dir] of [
    ["up", 0], ["right", 1], ["down", 2], ["left", 3],
    ["diagonal", 0], [2, 0],
  ] as const) {
    assert.equal(
      (skyDefinition.normalize({ direction }, colors).params as { dir: number }).dir,
      dir,
    );
  }
});

test("Sky maps the synthetic public example without mutating or forwarding input", () => {
  const options = {
    scale: 61,
    warp: 28,
    wind: 73,
    speed: 17,
    direction: "right",
    label: "untrusted",
    image: "https://invalid.test/image",
    points: [[20, 30]],
  };
  const snapshot = structuredClone(options);

  assert.deepEqual(skyDefinition.normalize(options, colors), {
    params: { scale: 61, distortion: 28, swirl: 73, dir: 1 },
    speed: 17,
  });
  assert.deepEqual(options, snapshot);
  assert.deepEqual(colors, ["#112233", "#445566", "#778899", "#AABBCC"]);
});
