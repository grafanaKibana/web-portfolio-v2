/** Generates first-paint hero images from the same Still painter and approved configuration. */
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { paintRecipe } from "../components/gradient-background/upstream/feral-gradient-runtime.jsx";
import { normalizeGradient } from "../components/gradient-background/gradient-background.helpers.ts";
import { heroDarkStillOptions, heroPalettes, heroStillOptions } from "../app/(home)/_components/hero/hero-background.config.ts";
import { encodeStillImage, StillCanvas } from "./hero-background-image.mjs";

/**
 * Paints the Still field at 6× native detail, retaining its original 32:21 composition.
 * @param colors - Approved theme palette.
 * @param options - Theme-specific Still geometry and spatial grain.
 * @returns A lossless, dithered image of the field.
 */
async function field(colors, options) {
  const canvas = new StillCanvas();
  const { recipe } = normalizeGradient({ variant: "still", colors, options, noise: 0, soften: 0 });
  paintRecipe(canvas, recipe);
  if (!canvas.pixels) throw new Error("Still painter produced no pixels.");
  return encodeStillImage(canvas.pixels, canvas.width, canvas.height);
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
  return sharp(pixels, { raw: { width: 256, height: 256, channels: 1 } })
    .webp({ quality: 40 })
    .toBuffer();
}

const directory = new URL("../app/(home)/_components/hero/", import.meta.url);
const light = await field(heroPalettes.light, heroStillOptions);
const dark = await field(heroPalettes.dark, heroDarkStillOptions);
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
