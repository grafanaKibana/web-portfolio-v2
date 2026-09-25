import assert from "node:assert/strict";
import test from "node:test";

import { meshDefinition } from "./mesh";

const colors = ["#112233", "#445566", "#778899"];

test("mesh exposes source defaults and complete point controls", () => {
  assert.equal(meshDefinition.type, "AIR");
  assert.equal(meshDefinition.animated, false);
  assert.deepEqual(meshDefinition.colors, [
    "#EAF4FC",
    "#B28FCE",
    "#F4B3C2",
    "#A0D8EF",
  ]);
  assert.equal(meshDefinition.noise, 8);
  assert.equal(meshDefinition.soften, 6);
  assert.deepEqual(meshDefinition.defaults, { points: null });
  assert.deepEqual(meshDefinition.controls, [
    { key: "points", label: "Mesh points", kind: "points", min: 0, max: 100 },
  ]);
});

test("mesh omits points to preserve the source fallback cycle", () => {
  for (const options of [undefined, null, {}, { points: null }]) {
    assert.deepEqual(meshDefinition.normalize(options, colors), {});
  }
});

test("mesh copies ordered point geometry and clamps coordinates", () => {
  const points = [[-10, 110], [78.5, 26], [50, 90]];
  const options = { points, label: "ignored", mesh: [[3, 3]] };

  assert.deepEqual(meshDefinition.normalize(options, colors), {
    mesh: [[0, 100], [78.5, 26], [50, 90]],
  });
  assert.deepEqual(points, [[-10, 110], [78.5, 26], [50, 90]]);
});

test("mesh rejects incomplete or malformed point collections", () => {
  const sparsePoint = Array(2);
  sparsePoint[0] = 10;
  for (const points of [
    [],
    [[10, 20]],
    [[10, 20], [30, 40], [50]],
    [[10, 20], [30, Number.NaN], [50, 60]],
    [[10, 20], [30, "40"], [50, 60]],
    [[10, 20], sparsePoint, [50, 60]],
    "10,20",
  ]) {
    assert.throws(
      () => meshDefinition.normalize({ points }, colors),
      /one finite \[x, y\] pair per color/,
    );
  }
});
