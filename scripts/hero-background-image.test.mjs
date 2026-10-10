import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import {
  encodeStillImage,
  quantizeRgba,
  StillCanvas,
} from "./hero-background-image.mjs";

test("Still canvas preserves fractional color channels until final quantization", () => {
  const canvas = new StillCanvas();
  canvas.width = 2;
  canvas.height = 1;
  const context = canvas.getContext();
  const image = context.createImageData(canvas.width, canvas.height);

  image.data[0] = 12.25;
  context.putImageData(image);

  assert.equal(canvas.pixels[0], 12.25);
});

test("RGB dithering returns deterministic byte-bounded output", () => {
  const pixels = new Float32Array(4096 * 4);
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = index % 8 === 0 ? -4.5 : 20.25;
    pixels[index + 1] = 80.5;
    pixels[index + 2] = index % 12 === 0 ? 260.5 : 140.75;
    pixels[index + 3] = 255;
  }

  const first = quantizeRgba(pixels);
  const second = quantizeRgba(pixels);

  assert.deepEqual(first, second);
  assert.ok(first.every((channel) => channel >= 0 && channel <= 255));
});

test("RGB dithering preserves neutral color and the source mean", () => {
  const pixelCount = 65_536;
  const pixels = new Float32Array(pixelCount * 4);
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = 48.25;
    pixels[index + 1] = 48.25;
    pixels[index + 2] = 48.25;
    pixels[index + 3] = 255;
  }

  const quantized = quantizeRgba(pixels);
  const levels = new Set();
  let sum = 0;
  for (let index = 0; index < quantized.length; index += 4) {
    assert.equal(quantized[index], quantized[index + 1]);
    assert.equal(quantized[index], quantized[index + 2]);
    assert.ok(quantized[index] === 48 || quantized[index] === 49);
    levels.add(quantized[index]);
    sum += quantized[index];
  }

  assert.deepEqual(levels, new Set([48, 49]));
  assert.ok(Math.abs(sum / pixelCount - 48.25) < 0.01);
});

test("RGB dithering leaves alpha unchanged", () => {
  const pixels = new Float32Array([
    10.25, 20.5, 30.75, 0,
    40.25, 50.5, 60.75, 64,
    70.25, 80.5, 90.75, 128,
    100.25, 110.5, 120.75, 255,
  ]);

  const quantized = quantizeRgba(pixels);

  assert.deepEqual(
    [quantized[3], quantized[7], quantized[11], quantized[15]],
    [0, 64, 128, 255],
  );
});

test("lossless WebP preserves every generated RGB byte", async () => {
  const width = 8;
  const height = 4;
  const pixels = new Float32Array(width * height * 4);
  const expected = new Uint8Array(width * height * 3);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const source = pixel * 4;
    const target = pixel * 3;
    pixels[source] = expected[target] = 20 + pixel % 3;
    pixels[source + 1] = expected[target + 1] = 36 + pixel % 5;
    pixels[source + 2] = expected[target + 2] = 52 + pixel % 7;
    pixels[source + 3] = 255;
  }

  const encoded = await encodeStillImage(pixels, width, height);
  const decoded = await sharp(encoded).removeAlpha().raw().toBuffer();

  assert.deepEqual(decoded, Buffer.from(expected));
});
