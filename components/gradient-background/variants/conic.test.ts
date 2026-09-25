import assert from "node:assert/strict";
import { test } from "node:test";
import { conicDefinition } from "./conic";

test("conic keeps source-observed static palette and finish defaults", () => {
  assert.equal(conicDefinition.type, "ANGULAR");
  assert.equal(conicDefinition.animated, false);
  assert.deepEqual(conicDefinition.colors, [
    "#316745",
    "#68BE8D",
    "#A2D7DD",
    "#EBF6F7",
  ]);
  assert.equal(conicDefinition.soften, 4);
  assert.equal(conicDefinition.noise, 10);
  assert.deepEqual(conicDefinition.controls, []);
});

test("conic ignores unsupported fields without mutating input", () => {
  const colors = ["#112233", "#445566"];
  const cases: unknown[] = [
    undefined,
    { origin: "0% 0%", angle: 90, speed: 100 },
    { label: "untrusted", asset: "https://example.invalid/image.png" },
  ];

  for (const options of cases) {
    const originalOptions = structuredClone(options);
    const originalColors = [...colors];
    assert.deepEqual(conicDefinition.normalize(options, colors), {});
    assert.deepEqual(options, originalOptions);
    assert.deepEqual(colors, originalColors);
  }
});
