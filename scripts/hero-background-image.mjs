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
