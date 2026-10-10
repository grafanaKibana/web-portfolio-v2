import assert from "node:assert/strict";
import test from "node:test";

import { createHeroDither, resolveHeroCover, resolveHeroRaster } from "./hero-background.helpers";

test("cover crop preserves the image center across extreme aspect ratios", () => {
  assert.deepEqual(resolveHeroCover(3200, 400, 3840, 2520), [1, 4 / 21]);
  assert.deepEqual(resolveHeroCover(400, 3200, 3840, 2520), [0.08203125, 1]);
  assert.deepEqual(resolveHeroCover(3840, 2520, 3840, 2520), [1, 1]);
});

test("raster resolution retains native DPR while respecting every GPU limit", () => {
  assert.deepEqual(resolveHeroRaster(1200, 700, 2, 4096, [4096, 4096]), {
    width: 2400,
    height: 1400,
    pixelRatio: 2,
  });
  assert.equal(resolveHeroRaster(3000, 1400, 2, 4096, [8192, 8192]), null, "Renderbuffer limit");
  assert.equal(resolveHeroRaster(1200, 700, 2, 4096, [2000, 4096]), null, "Viewport limit");
  assert.equal(resolveHeroRaster(2000, 2000, 2, 8192, [8192, 8192]), null, "Eight-megapixel limit");
  assert.equal(resolveHeroRaster(0, 700, 2, 4096, [4096, 4096]), null, "Invalid geometry");
});

test("raster reports the actual horizontal ratio after integer sizing", () => {
  assert.deepEqual(resolveHeroRaster(333, 111, 1.5, 4096, [4096, 4096]), {
    width: 500,
    height: 167,
    pixelRatio: 500 / 333,
  });
});

test("dither is deterministic, balanced, and spatially shuffled", () => {
  const first = createHeroDither();
  const second = createHeroDither();
  assert.deepEqual(first, second);
  assert.equal(first.length, 256 * 256);

  const counts = new Uint16Array(256);
  let sum = 0;
  for (const value of first) {
    counts[value] = (counts[value] ?? 0) + 1;
    sum += value;
  }
  assert.ok(counts.every((count) => count === 256));
  assert.equal(sum / first.length, 127.5);
  assert.ok(first.slice(0, 256).some((value, index) => value !== index));
  assert.notDeepEqual(first.slice(0, 256), first.slice(256, 512));
});
