/** Generates first-paint hero images from the same Still painter and approved configuration. */
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { paintRecipe } from "../components/gradient-background/upstream/feral-gradient-runtime.jsx";
import { normalizeGradient } from "../components/gradient-background/gradient-background.helpers.ts";
import { heroPalettes, heroStillOptions } from "../app/(home)/_components/hero/hero-background.config.ts";

/** Minimal raster target for Still's ImageData painter; no browser or native canvas is needed. */
class StillCanvas {
  width = 640;
  height = 420;
  pixels = null;

  /** Supplies only the raster operations used by the static Still painter.
   * @returns Minimal drawing context backed by this canvas pixel buffer.
   */
  getContext() {
    return {
      /** Discards previously painted pixels. */
      clearRect: () => { this.pixels = null; },
      /** Allocates an empty RGBA raster.
       * @param width - Raster width in pixels.
       * @param height - Raster height in pixels.
       * @returns Dimensions and a zero-filled pixel buffer.
       */
      createImageData: (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
      /** Stores the raster produced by the Still painter.
       * @param image - Image data containing painted pixels.
       */
      putImageData: (image) => { this.pixels = image.data; },
      /** Copies pixels from an equally sized scratch canvas.
       * @param source - Scratch canvas holding the rendered field.
       * @throws When the scratch canvas dimensions differ from this target.
       */
      drawImage: (source) => {
        if (source.width !== this.width || source.height !== this.height) {
          throw new Error("Still image dimensions changed; review the upstream raster path.");
        }
        this.pixels = source.pixels;
      },
    };
  }
}

/**
 * Encodes a compact, independently cacheable image.
 * @param pixels - Raw raster channels.
 * @param width - Pixel width.
 * @param height - Pixel height.
 * @param channels - Number of channels per pixel.
 * @param quality - WebP quality; low-opacity grain tolerates stronger compression.
 * @returns Encoded WebP bytes.
 */
async function encodeImage(pixels, width, height, channels, quality = 95) {
  const image = await sharp(pixels, { raw: { width, height, channels } }).webp({ quality }).toBuffer();
  return image;
}

/**
 * Paints the upstream Still field, retaining its fixed 640 × 420 composition.
 * @param colors - Approved theme palette.
 * @returns A compact image of the field.
 */
async function field(colors) {
  const canvas = new StillCanvas();
  const { recipe } = normalizeGradient({ variant: "still", colors, options: heroStillOptions, noise: 0, soften: 0 });
  paintRecipe(canvas, recipe);
  if (!canvas.pixels) throw new Error("Still painter produced no pixels.");
  return encodeImage(canvas.pixels, canvas.width, canvas.height, 4);
}

/** Reproduces the upstream seeded monochrome tile; CSS retains the requested noise opacity.
 * @returns Encoded monochrome grain tile as WebP bytes.
 */
async function noiseTile() {
  let seed = 1977;
  /** Returns the next deterministic upstream grain sample.
   * @returns Pseudorandom value in the half-open unit interval.
   */
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const pixels = new Uint8Array(256 * 256);
  for (let index = 0; index < pixels.length; index += 1) {
    pixels[index] = Math.round((random() + random()) / 2 * 255);
  }
  return encodeImage(pixels, 256, 256, 1, 40);
}

const directory = new URL("../app/(home)/_components/hero/", import.meta.url);
const previousDocument = globalThis.document;
try {
  // The upstream painter creates one scratch canvas. Keep the shim local to this build process.
  globalThis.document = {
    /** Creates the scratch canvas required by the upstream painter.
     * @returns A fresh raster target.
     */
    createElement: () => new StillCanvas(),
  };
  const light = await field(heroPalettes.light);
  const dark = await field(heroPalettes.dark);
  const noise = await noiseTile();
  let totalBytes = 0;
  for (const [name, output] of Object.entries({ light, dark, noise })) {
    const destination = new URL(`hero-${name}.generated.webp`, directory);
    const previous = await readFile(destination).catch(() => null);
    if (process.argv.includes("--check")) {
      if (!previous?.equals(output)) throw new Error("Hero images are stale. Run npm run generate:hero-backgrounds.");
    } else if (!previous?.equals(output)) {
      await writeFile(destination, output);
    }
    totalBytes += output.length;
  }
  console.log(`Hero backgrounds ready (${Math.round(totalBytes / 1024)} KiB cacheable assets, both themes).`);
} finally {
  if (previousDocument === undefined) delete globalThis.document;
  else globalThis.document = previousDocument;
}
