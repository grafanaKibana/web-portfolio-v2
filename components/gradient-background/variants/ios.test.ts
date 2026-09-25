import assert from "node:assert/strict";
import test from "node:test";
import { iosDefinition } from "./ios";

test("iOS metadata preserves editor defaults and static engine identity", () => {
  assert.equal(iosDefinition.type, "IOS");
  assert.equal(iosDefinition.animated, false);
  assert.deepEqual(iosDefinition.colors, ["#4C6CB3", "#B28FCE", "#F4B3C2"]);
  assert.equal(iosDefinition.soften, 12);
  assert.equal(iosDefinition.noise, 14);
  assert.deepEqual(iosDefinition.controls, []);
  assert.deepEqual(iosDefinition.defaults, {});
});

test("iOS adapter ignores unsupported options without mutating caller data", () => {
  for (const options of [
    undefined,
    {},
    { angle: 45, text: "ignore", image: "https://example.com/asset.png" },
    { geometry: { points: [[12, 8]] }, animated: true },
  ]) {
    const colors = ["#123456", "#ABCDEF"];
    const before = structuredClone(options);

    assert.deepEqual(iosDefinition.normalize(options, colors), {});
    assert.deepEqual(options, before);
    assert.deepEqual(colors, ["#123456", "#ABCDEF"]);
  }
});
