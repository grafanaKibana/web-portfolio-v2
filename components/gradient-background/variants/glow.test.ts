import assert from "node:assert/strict";
import { test } from "node:test";
import { glowDefinition } from "./glow";

const palette = ["#102030", "#80F0C0", "#F090B0"];

/** Returns renderer lines after asserting the adapter produced them. */
function linesFor(options: unknown): Record<string, unknown>[] {
  const lines = glowDefinition.normalize(options, palette).lines;
  assert.ok(lines);
  return lines;
}

test("Glow keeps the source Edge palette, shape order, and preset overrides", () => {
  assert.equal(glowDefinition.type, "GLOW");
  assert.deepEqual(glowDefinition.colors, ["#072B35", "#DEFF58", "#31E7BC"]);
  assert.equal(glowDefinition.animated, true);
  assert.equal(glowDefinition.noise, 0);
  assert.equal(glowDefinition.soften, 0);
  assert.deepEqual(glowDefinition.controls.map(({ key }) => key), ["speed", "shapes"]);

  const lines = linesFor(undefined);
  assert.equal(lines.length, 2);
  assert.deepEqual(
    lines.map(({ x, y, scale, amp, rotate, edgeAngle, edgeWidth, shift, span }) =>
      ({ x, y, scale, amp, rotate, edgeAngle, edgeWidth, shift, span })),
    [
      { x: 34, y: 1, scale: 170, amp: 50, rotate: -45, edgeAngle: 80, edgeWidth: 27, shift: 0, span: 10 },
      { x: 53, y: 108, scale: 158, amp: 70, rotate: -9, edgeAngle: -95, edgeWidth: 26, shift: 90, span: 10 },
    ],
  );
  assert.deepEqual(lines.map(({ id }) => id), ["glow-shape-1", "glow-shape-2"]);
});

test("Glow maps speed and each editable shape field with editor bounds", () => {
  const options = {
    speed: 200,
    shapes: [{
      form: "flower", seed: 20000, turns: 1, curl: -5, amp: 110,
      width: 1, taper: 101, sway: 120, x: -100, y: 200,
      scale: 250, rotate: 300, reverse: true, shift: 150, span: 1,
      edgeGlow: false, edgeWidth: 110, edgeStrength: 160,
      edgeAngle: -200, body: 120, shadow: -10, blur: 120,
      pts: [[-2, 2], [0.2, -0.3]],
      label: "must not render", asset: "https://example.invalid/image",
    }],
  };
  const original = structuredClone(options);
  const recipe = glowDefinition.normalize(options, palette);
  assert.equal(recipe.speed, 100);
  assert.deepEqual(recipe.lines?.[0], {
    id: "glow-shape-1", form: "flower", seed: 9999, turns: 3,
    curl: 0, amp: 100, width: 4, taper: 100, sway: 100,
    x: -20, y: 120, scale: 220, rotate: 180, reverse: true,
    shift: 100, span: 5, edgeGlow: false, edgeWidth: 100,
    edgeStrength: 150, edgeAngle: -180, body: 100, shadow: 0,
    blur: 100, pts: [[-1.5, 1.5], [0.2, -0.3]],
  });
  assert.deepEqual(options, original);
});

test("Glow uses form-specific defaults without replacing Edge preset defaults", () => {
  const [ring, scribble, invalid] = linesFor({ shapes: [
    { form: "ring" },
    { form: "scribble" },
    { form: "unknown" },
  ] });
  assert.ok(ring);
  assert.ok(scribble);
  assert.ok(invalid);
  assert.deepEqual(
    [ring.turns, ring.curl, ring.width, ring.scale, ring.shift, ring.span],
    [1, 55, 55, 110, 70, 60],
  );
  assert.deepEqual(
    [scribble.turns, scribble.curl, scribble.amp, scribble.width, scribble.scale],
    [4, 62, 55, 22, 190],
  );
  assert.deepEqual([invalid.form, invalid.turns, invalid.scale], ["blob", 1, 105]);
});

test("Glow rejects invalid shape collections and custom point structures", () => {
  for (const shapes of [null, [], Array(13).fill({}), [null], [3]]) {
    assert.throws(() => linesFor({ shapes }), /Glow shapes|Glow shape/);
  }
  for (const pts of [[], [[0, 0]], [[0, 0], [Infinity, 0]], [[0, 0, 0], [0, 0]]]) {
    assert.throws(() => linesFor({ shapes: [{ pts }] }), /points/);
  }
  assert.throws(() => linesFor({ shapes: [{ pts: Array(97).fill([0, 0]) }] }), /points/);
});

test("Glow replaces non-finite scalar values with defaults", () => {
  const recipe = glowDefinition.normalize({ speed: Infinity, shapes: [{ sway: NaN }] }, palette);
  assert.equal(recipe.speed, 0);
  const firstLine = recipe.lines?.[0];
  assert.ok(firstLine);
  assert.equal(firstLine.sway, 0);
});
