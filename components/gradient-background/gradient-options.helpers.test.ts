import assert from "node:assert/strict";
import test from "node:test";
import {
  asRecord,
  enumOption,
  numberOption,
  pointsOption,
} from "./gradient-options.helpers";

test("option helpers reject unsupported values and preserve valid edges", () => {
  assert.deepEqual(asRecord(null), {});
  assert.deepEqual(asRecord(["value"]), {});
  assert.deepEqual(asRecord({ value: 3 }), { value: 3 });
  assert.equal(numberOption(Number.NaN, 12, 0, 20), 12);
  assert.equal(numberOption(Number.POSITIVE_INFINITY, 12, 0, 20), 12);
  assert.equal(numberOption(-1, 12, 0, 20), 0);
  assert.equal(numberOption(20, 12, 0, 20), 20);
  assert.equal(enumOption("b", ["a", "b"] as const, "a"), "b");
  assert.equal(enumOption("c", ["a", "b"] as const, "a"), "a");
});

test("pointsOption validates cardinality without mutating the source", () => {
  const source = [
    [-4, 101],
    [45, 55],
  ];
  const snapshot = structuredClone(source);

  assert.deepEqual(pointsOption(source, 2), [
    [3, 97],
    [45, 55],
  ]);
  assert.deepEqual(source, snapshot);
  assert.equal(pointsOption(source, 3), undefined);
  assert.equal(pointsOption([[10, Number.NaN]], 1), undefined);
  assert.equal(pointsOption([[10]], 1), undefined);
});
