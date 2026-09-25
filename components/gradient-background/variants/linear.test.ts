import assert from "node:assert/strict";
import test from "node:test";

import { normalizeGradient } from "../gradient-background.helpers";
import { linearDefinition } from "./linear";

test("linear uses the source editor's static preset and no variant-only controls", () => {
  assert.equal(linearDefinition.type, "LINEAR");
  assert.equal(linearDefinition.label, "Linear");
  assert.equal(linearDefinition.animated, false);
  assert.deepEqual(linearDefinition.colors, ["#B28FCE", "#FEF4F4"]);
  assert.equal(linearDefinition.noise, 12);
  assert.equal(linearDefinition.soften, 6);
  assert.deepEqual(linearDefinition.defaults, {});
  assert.deepEqual(linearDefinition.controls, []);
});

test("linear ignores unsupported options without copying or mutating input", () => {
  const colors = ["#112233", "#445566"];
  const options = Object.freeze({
    angle: 42,
    speed: 80,
    text: "remote content",
  });

  for (const input of [undefined, null, options]) {
    assert.deepEqual(linearDefinition.normalize(input, colors), {});
  }

  assert.deepEqual(colors, ["#112233", "#445566"]);
  assert.deepEqual(options, {
    angle: 42,
    speed: 80,
    text: "remote content",
  });
});

test("linear maps editor defaults into a static recipe", () => {
  const { recipe, paused } = normalizeGradient({ variant: "linear" });

  assert.deepEqual(recipe.stops, ["#B28FCE", "#FEF4F4"]);
  assert.deepEqual(recipe.divs, [0.5]);
  assert.equal(recipe.type, "LINEAR");
  assert.equal(recipe.grain, 12);
  assert.equal(recipe.blur, 6);
  assert.equal(recipe.fieldBlur, 6);
  assert.equal(recipe.animated, false);
  assert.equal(recipe.speed, 0);
  assert.equal(paused, true);
});

test("linear preserves palette geometry and clamps finish controls", () => {
  const input = Object.freeze({
    variant: "linear",
    colors: Object.freeze(["#123", "#445566", "#abcdef"]),
    balance: Object.freeze([-1, 2]),
    noise: -20,
    soften: 100,
    animated: true,
    options: Object.freeze({ angle: 45, speed: 80, text: "external" }),
  });
  const { recipe } = normalizeGradient(input);

  assert.deepEqual(recipe.stops, ["#112233", "#445566", "#ABCDEF"]);
  assert.deepEqual(recipe.divs, [0.05, 0.95]);
  assert.equal(recipe.grain, 0);
  assert.equal(recipe.blur, 80);
  assert.equal(recipe.fieldBlur, 80);
  assert.equal(recipe.animated, false);
  assert.equal(recipe.speed, 0);
  assert.equal("angle" in recipe, false);
  assert.equal("text" in recipe, false);
  assert.deepEqual(input.balance, [-1, 2]);
  assert.deepEqual(input.colors, ["#123", "#445566", "#abcdef"]);
});
