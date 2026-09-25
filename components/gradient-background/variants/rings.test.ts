import assert from "node:assert/strict";
import { test } from "node:test";
import { ringsDefinition } from "./rings";

test("rings uses Ripple preset defaults rather than renderer fallbacks", () => {
  assert.equal(ringsDefinition.type, "RING");
  assert.equal(ringsDefinition.animated, false);
  assert.deepEqual(ringsDefinition.colors, ["#EBF6F7", "#A2D7DD", "#00A3AF", "#274A78"]);
  assert.equal(ringsDefinition.noise, 8);
  assert.equal(ringsDefinition.soften, 5);
  assert.deepEqual(ringsDefinition.normalize(undefined, ringsDefinition.colors), {
    params: { count: 12, melt: 8, glow: 100, sweep: 100, dirX: 0, dirY: 0 },
  });
});

test("rings maps every public control to renderer parameters without mutating input", () => {
  const origin = { x: 0.25, y: 0.75 };
  const options = { count: 17, melt: 41, glow: 65, sweep: 33, origin, text: "ignored" };
  const colors = ["#123456", "#ABCDEF"];
  assert.deepEqual(ringsDefinition.normalize(options, colors), {
    params: { count: 17, melt: 41, glow: 65, sweep: 33, dirX: 0.25, dirY: 0.75 },
  });
  assert.deepEqual(options.origin, origin);
  assert.deepEqual(colors, ["#123456", "#ABCDEF"]);
});

test("rings clamps and quantizes editor controls", () => {
  for (const [options, expected] of [
    [
      { count: -10, melt: -1, glow: 200, sweep: 12.8, origin: { x: -2, y: 2 } },
      { count: 5, melt: 0, glow: 100, sweep: 13, dirX: 0, dirY: 1 },
    ],
    [
      { count: 40, melt: 40.6, glow: 30.2, sweep: 0, origin: { x: 0.456, y: 0.994 } },
      { count: 24, melt: 41, glow: 30, sweep: 0, dirX: 0.46, dirY: 0.99 },
    ],
  ] as const) {
    assert.deepEqual(ringsDefinition.normalize(options, []), { params: expected });
  }
});

test("rings rejects malformed origin and ignores invalid scalar values", () => {
  for (const origin of [null, [], "center", 0]) {
    assert.throws(() => ringsDefinition.normalize({ origin }, []), /Rings origin/);
  }
  assert.deepEqual(
    ringsDefinition.normalize(
      { count: Infinity, melt: "10", glow: NaN, sweep: null, origin: { x: NaN, y: "0.5" } },
      [],
    ),
    { params: { count: 12, melt: 8, glow: 100, sweep: 100, dirX: 0, dirY: 0 } },
  );
});
