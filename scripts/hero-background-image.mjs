import sharp from "sharp";

/** Minimal raster target retaining Still's fractional colors until final quantization. */
export class StillCanvas {
  width = 3840;
  height = 2520;
  pixels = null;

  /** Supplies the raster operations used by the static Still painter.
   * @returns Drawing context backed by this canvas pixel buffer.
   */
  getContext() {
    return {
      /** Discards previously painted pixels. */
      clearRect: () => { this.pixels = null; },
      /** Allocates a high-precision RGBA raster to avoid rounding the gradient prematurely.
       * @param width - Raster width in pixels.
       * @param height - Raster height in pixels.
       * @returns Dimensions and a zero-filled floating-point pixel buffer.
       */
      createImageData: (width, height) => ({ width, height, data: new Float32Array(width * height * 4) }),
      /** Stores the raster produced by the Still painter.
       * @param image - Image data containing painted pixels.
       */
      putImageData: (image) => { this.pixels = image.data; },
    };
  }
}

/**
 * Rounds fractional RGB with deterministic sub-byte dithering, preserving neutral colors and alpha.
 * @param pixels - Floating-point RGBA channels in the byte range.
 * @returns Dithered RGBA bytes for encoding.
 */
export function quantizeRgba(pixels) {
  const output = new Uint8ClampedArray(pixels.length);
  let seed = 1977;
  for (let index = 0; index < pixels.length; index += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const dither = seed / 4294967296 - 0.5;
    for (let channel = 0; channel < 3; channel += 1) {
      output[index + channel] = Math.round(pixels[index + channel] + dither);
    }
    output[index + 3] = pixels[index + 3];
  }
  return output;
}

/**
 * Encodes a dithered field losslessly so compression cannot merge neighboring dark shades again.
 * @param pixels - High-precision RGBA field.
 * @param width - Pixel width.
 * @param height - Pixel height.
 * @returns Independently cacheable WebP bytes.
 */
export async function encodeStillImage(pixels, width, height) {
  return sharp(quantizeRgba(pixels), { raw: { width, height, channels: 4 } })
    .webp({ lossless: true })
    .toBuffer();
}

/**
 * Encodes the hero fade with spatial alpha dithering to avoid horizontal compositing bands.
 * @returns A lossless alpha texture, transparent at the top and opaque at the bottom.
 */
export async function encodeHeroFade() {
  const width = 256;
  const height = 2048;
  const stops = [[0, 0], [0.18, 0], [0.30, 0.03], [0.44, 0.13], [0.58, 0.33], [0.72, 0.60], [0.86, 0.85], [0.95, 0.97], [1, 1]];
  const pixels = new Uint8Array(width * height * 4).fill(255);
  let seed = 12345;
  let stop = 0;
  for (let y = 0; y < height; y += 1) {
    const position = y / (height - 1);
    while (position > stops[stop + 1][0]) stop += 1;
    const [start, startAlpha] = stops[stop];
    const [end, endAlpha] = stops[stop + 1];
    const alpha = (startAlpha + (endAlpha - startAlpha) * (position - start) / (end - start)) * 255;
    // Keep the mean fade intact without clipping noise at either endpoint.
    const amplitude = Math.min(16, alpha * 2, (255 - alpha) * 2);
    for (let x = 0; x < width; x += 1) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      pixels[(y * width + x) * 4 + 3] = Math.round(alpha + ((seed >>> 0) / 4294967296 - 0.5) * amplitude);
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 4 } })
    .webp({ lossless: true })
    .toBuffer();
}
