const MAX_HERO_PIXELS = 8_000_000;
const DITHER_SIDE = 256;

/** Resolves the centered UV span that reproduces CSS `background-size: cover`.
 * @param cssWidth - Rendered hero width in CSS pixels.
 * @param cssHeight - Rendered hero height in CSS pixels.
 * @param imageWidth - Source image width in pixels.
 * @param imageHeight - Source image height in pixels.
 * @returns Horizontal and vertical source UV spans.
 */
export function resolveHeroCover(
  cssWidth: number,
  cssHeight: number,
  imageWidth: number,
  imageHeight: number,
): readonly [number, number] {
  const containerAspect = cssWidth / cssHeight;
  const imageAspect = imageWidth / imageHeight;
  return containerAspect > imageAspect
    ? [1, imageAspect / containerAspect]
    : [containerAspect / imageAspect, 1];
}

/** Resolves a native-density hero framebuffer without resampling its pixel dither.
 * @param cssWidth - Rendered hero width in CSS pixels.
 * @param cssHeight - Rendered hero height in CSS pixels.
 * @param dpr - Current device pixel ratio.
 * @param maxSize - Maximum supported renderbuffer dimension.
 * @param maxViewport - Maximum supported viewport width and height.
 * @returns Native framebuffer dimensions, or null when native rendering exceeds a limit.
 */
export function resolveHeroRaster(
  cssWidth: number,
  cssHeight: number,
  dpr: number,
  maxSize: number,
  maxViewport: readonly [number, number],
): { width: number; height: number; pixelRatio: number } | null {
  if (![cssWidth, cssHeight, dpr, maxSize, ...maxViewport].every(Number.isFinite)
    || cssWidth <= 0 || cssHeight <= 0 || dpr <= 0 || maxSize <= 0
    || maxViewport[0] <= 0 || maxViewport[1] <= 0) return null;

  const width = Math.round(cssWidth * dpr);
  const height = Math.round(cssHeight * dpr);
  if (width < 1 || height < 1 || width > maxSize || height > maxSize
    || width > maxViewport[0] || height > maxViewport[1]
    || width * height > MAX_HERO_PIXELS) return null;

  return { width, height, pixelRatio: width / cssWidth };
}

/** Creates a balanced deterministic byte-noise texture for final RGB rounding.
 * @returns A shuffled 256×256 monochrome texture containing each byte 256 times.
 */
export function createHeroDither(): Uint8Array {
  const values = new Uint8Array(DITHER_SIDE * DITHER_SIDE);
  for (let index = 0; index < values.length; index += 1) values[index] = index % 256;

  let seed = 0x6d2b79f5;
  for (let index = values.length - 1; index > 0; index -= 1) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    const target = (seed >>> 0) % (index + 1);
    const value = values[index] ?? 0;
    values[index] = values[target] ?? 0;
    values[target] = value;
  }
  return values;
}
