import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { gunzipSync } from "node:zlib";

import type { GradientRecipe } from "../gradient-background.models";
import { adaptFeralGradientRuntime } from "./adapt-feral-gradient-runtime.mjs";
import { getFeralCssBackground } from "./feral-gradient-css";

const UPSTREAM_DIRECTORY = new URL("./", import.meta.url);
const SOURCE_RUNTIME = new URL(
  "./fixtures/feral-gradient-runtime.raw.jsx.gz",
  UPSTREAM_DIRECTORY,
);
const SOURCE_BUILDER = new URL(
  "./fixtures/feral-css-generator.js.txt",
  UPSTREAM_DIRECTORY,
);
const VENDORED_RUNTIME = new URL(
  "./feral-gradient-runtime.jsx",
  UPSTREAM_DIRECTORY,
);

/** Builds a synthetic normalized recipe for source parity checks. */
function recipe(type: string): GradientRecipe {
  return {
    type,
    name: `${type} test`,
    width: 640,
    height: 360,
    stops: ["#102030", "#507090", "#90B0D0", "#F0E0C0"],
    divs: [0.18, 0.55, 0.84],
    grain: 12,
    fieldBlur: 4,
    blur: 4,
    speed: 24,
    startT: 20.75,
    animated: false,
    lines: [],
  };
}

/** Runs the captured builder's `y6` CSS generator without loading its app. */
function generateWithCapturedBuilder(
  builder: string,
  input: GradientRecipe,
): string {
  const start = builder.indexOf("const g6=.62/.5;");
  assert.notEqual(start, -1, "captured builder CSS helpers are present");

  const context = vm.createContext({ __recipe: input });
  const script = new vm.Script(
    `${builder.slice(start)};globalThis.__result=y6(__recipe);`,
  );
  script.runInContext(context);
  return context.__result as string;
}

test("adaptation script reproduces the checked-in runtime byte for byte", async () => {
  const [source, vendored] = await Promise.all([
    readFile(SOURCE_RUNTIME).then((value) => gunzipSync(value).toString("utf8")),
    readFile(VENDORED_RUNTIME, "utf8"),
  ]);

  assert.equal(adaptFeralGradientRuntime(source), vendored);
  assert.equal(vendored.includes("__FERAL_RECIPE__"), false);
  assert.equal(vendored.includes("fonts.googleapis.com"), false);
  assert.equal(
    vendored.match(/Math\.min\(2,window\.devicePixelRatio\|\|1\)/g)?.length,
    2,
  );
});

test("CSS recipes match the captured builder b6 generator", async () => {
  const builder = await readFile(SOURCE_BUILDER, "utf8");

  for (const type of ["LINEAR", "IOS", "CIRCLE", "ANGULAR"]) {
    const input = recipe(type);
    assert.equal(
      getFeralCssBackground(input),
      generateWithCapturedBuilder(builder, input),
      type,
    );
  }
});

test("WebGL noise initialization is self-contained and deterministic", async () => {
  const vendored = await readFile(VENDORED_RUNTIME, "utf8");
  const initializer = vendored.match(/let o=new Uint8Array\(256\*256\*4\),FeralNoiseSeed[\s\S]*?o\[r\*4\+3\]=255\}/)?.[0];
  assert.ok(initializer, "adapted WebGL texture initializer is present");
  const script = new vm.Script(`${initializer};Array.from(o)`);
  const first = script.runInNewContext() as number[];
  const second = script.runInNewContext() as number[];
  assert.equal(first.length, 256 * 256 * 4);
  assert.deepEqual(Array.from(first), Array.from(second));
  assert.ok(new Set(first).size > 200, "noise texture retains varied samples");
});

test("generated runtime exposes required recipe and renderer evidence seams", async () => {
  const vendored = await readFile(VENDORED_RUNTIME, "utf8");

  assert.match(vendored, /function uc\(\{recipe:ee,/);
  assert.match(vendored, /data-feral-renderer/);
  assert.match(vendored, /!ee\.animated/);
  assert.match(vendored, /onError:Kc/);
});

test("Still paints one final grained frame before display without a delayed preview swap", async () => {
  const vendored = await readFile(VENDORED_RUNTIME, "utf8");
  const start = vendored.indexOf("function zs(");
  const end = vendored.indexOf("var Ro=", start);
  const draws: unknown[][] = [];
  const canvas = { width: 0, height: 0, getContext: () => ({}) };
  const params = { positions: 76, mixing: 70, grain: 5 };
  const context = vm.createContext({
    ut: () => ({ current: canvas }),
    ua: () => false,
    mn: (value: unknown) => [value, () => undefined],
    cn: () => undefined,
    jn: (effect: () => void) => { effect(); },
    Tt: () => false,
    ht: () => false,
    Hn: (...args: unknown[]) => draws.push(args),
    oe: () => null,
    Ee: 50, Vt: 50, Ut: 50, Ht: 50, ea: 50, ae: 20.75,
    ll: 640, cl: 360, pl: 320, ml: 180,
    input: { type: "SMESH", stops: ["#123456", "#abcdef"], params },
  });
  // Preview rendering, timer scheduling, or a second paint would fail this harness.
  new vm.Script(`${vendored.slice(start, end)};zs(input);`).runInContext(context);
  assert.equal(draws.length, 1);
  assert.equal(draws[0]?.[6], params);
  assert.equal(canvas.width, 640);
  assert.equal(canvas.height, 360);
});

test("Sky WebGL loss falls back and releases shared resources after the last runtime", async () => {
  const vendored = await readFile(VENDORED_RUNTIME, "utf8");

  assert.match(vendored, /if\(!c\|\|c\.lost\)\{R1\(/);
  assert.match(vendored, /webglcontextlost/);
  assert.match(vendored, /webglcontextrestored/);
  assert.match(vendored, /xt===c&&\(c\.lost=!0\)/);
  assert.match(vendored, /FeralRuntimeInstances===0/);
  assert.match(vendored, /deleteTexture/);
  assert.match(vendored, /deleteBuffer/);
  assert.match(vendored, /deleteProgram/);
});
