import assert from "node:assert/strict";
import { test } from "node:test";
import { mistDefinition } from "./mist";

test("Mist preserves the built-in preset and full mountain defaults", () => {
  assert.equal(mistDefinition.type, "MIST");
  assert.equal(mistDefinition.animated, true);
  assert.deepEqual(mistDefinition.colors, [
    "#FBF2E2", "#F3DDC2", "#D9BCAE", "#B08F9B", "#7A6483", "#463A5E",
  ]);
  assert.equal(mistDefinition.noise, 12);
  assert.equal(mistDefinition.soften, 0);
  assert.deepEqual(mistDefinition.normalize(undefined, mistDefinition.colors), {
    size: 33,
    glintHorizon: 0.42,
    mist: { height: 50, sharp: 55, haze: 50, sun: 64, drift: 55, seed: 7 },
  });
});

test("Mist maps every public control and does not copy unknown fields", () => {
  const options = Object.freeze({
    rangeDensity: 40,
    skyShare: 0.48,
    peakHeight: 60,
    peakProfile: 45,
    fogDensity: 30,
    sunPosition: 75,
    drift: 20,
    seed: 21,
    text: "not a recipe field",
  });
  const colors = Object.freeze(["#111111", "#222222"]);

  assert.deepEqual(mistDefinition.normalize(options, colors), {
    size: 40,
    glintHorizon: 0.48,
    mist: { height: 60, sharp: 45, haze: 30, sun: 75, drift: 20, seed: 21 },
  });
  assert.deepEqual(colors, ["#111111", "#222222"]);
  assert.equal(options.seed, 21);
});

test("Mist clamps editor-bounded controls and rejects nonfinite numeric input", () => {
  const cases = [
    ["rangeDensity", -1, "size", 0],
    ["rangeDensity", 101, "size", 100],
    ["skyShare", 0, "glintHorizon", 0.2],
    ["skyShare", 1, "glintHorizon", 0.58],
    ["peakHeight", -1, "height", 0],
    ["peakProfile", 101, "sharp", 100],
    ["fogDensity", -1, "haze", 0],
    ["sunPosition", 101, "sun", 100],
    ["drift", -1, "drift", 0],
  ] as const;

  for (const [key, value, recipeKey, expected] of cases) {
    const recipe = mistDefinition.normalize({ [key]: value }, mistDefinition.colors);
    const actual = recipeKey === "size" || recipeKey === "glintHorizon"
      ? recipe[recipeKey]
      : (recipe.mist as Record<string, number>)[recipeKey];
    assert.equal(actual, expected, key);
  }

  assert.deepEqual(mistDefinition.normalize({ seed: Infinity, skyShare: NaN }, mistDefinition.colors),
    mistDefinition.normalize({}, mistDefinition.colors));
  assert.equal((mistDefinition.normalize({ seed: 123.9 }, mistDefinition.colors).mist as Record<string, number>).seed, 123);
});

test("Mist exposes each engine-specific public option as an editor control", () => {
  assert.deepEqual(
    mistDefinition.controls.map(({ key }) => key),
    Object.keys(mistDefinition.defaults),
  );
  assert.deepEqual(
    mistDefinition.controls.find(({ key }) => key === "skyShare"),
    { key: "skyShare", label: "Sky share", kind: "number", min: 0.2, max: 0.58, step: 0.01 },
  );
});
