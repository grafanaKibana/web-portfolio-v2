/** Foreground and optional neutral veil that protect text over an sRGB palette. */
export interface HeroContrastResult {
  foreground: "#000000" | "#ffffff";
  surface: "#ffffff" | "#000000";
  veilOpacity: number;
  minimumContrast: number;
}

/**
 * Selects black or white text and the smallest protective veil needed for AA contrast.
 * @param colors - At least two six-digit colors for Still's weighted sRGB field.
 * @param noise - Overlay noise percentage, from zero to 100.
 * @returns Colors and veil opacity guaranteeing at least 4.5:1 before the bottom fade.
 * @throws When palette colors are missing or malformed.
 */
export function resolveHeroContrast(colors: readonly string[], noise = 0): HeroContrastResult {
  if (colors.length < 2 || colors.some((color) => !/^#[\da-f]{6}$/i.test(color))) {
    throw new Error("Hero contrast requires at least two six-digit hex colors.");
  }
  if (!Number.isFinite(noise) || noise < 0 || noise > 100) {
    throw new Error("Hero noise must be a percentage from zero to 100.");
  }
  const channels = colors.map((color) => [1, 3, 5].map((offset) =>
    Number.parseInt(color.slice(offset, offset + 2), 16) / 255));
  // Still paints normalized positive-weight RGB mixtures; every channel stays
  // within its palette bounds, including spatial grain. The noise overlay uses
  // half the requested opacity; bound its darkest and brightest possible pixels.
  const opacity = noise / 200;
  const lower = [0, 1, 2].map((index) => {
    const value = Math.min(...channels.map((rgb) => rgb[index] ?? 0));
    return value - opacity * Math.min(value, 1 - value);
  });
  const upper = [0, 1, 2].map((index) => {
    const value = Math.max(...channels.map((rgb) => rgb[index] ?? 0));
    return value + opacity * Math.min(value, 1 - value);
  });

  for (let step = 0; step <= 100; step += 1) {
    const alpha = step / 100;
    const blackContrast = (luminance(lower.map((value) => value * (1 - alpha) + alpha)) + 0.05) / 0.05;
    const whiteContrast = 1.05 / (luminance(upper.map((value) => value * (1 - alpha))) + 0.05);
    // A small margin protects against browser rounding at the AA boundary.
    if (Math.max(blackContrast, whiteContrast) >= 4.6) {
      const black = blackContrast >= whiteContrast;
      return {
        foreground: black ? "#000000" : "#ffffff",
        surface: black ? "#ffffff" : "#000000",
        veilOpacity: alpha,
        minimumContrast: black ? blackContrast : whiteContrast,
      };
    }
  }
  throw new Error("Unable to establish hero contrast.");
}

/**
 * Converts normalized sRGB channels to WCAG relative luminance.
 * @param rgb - Red, green, and blue channels in the unit interval.
 * @returns Relative luminance.
 */
function luminance(rgb: number[]): number {
  const linear = rgb.map(linearChannel);
  return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0);
}

/** Decodes a unit sRGB channel into linear light. */
function linearChannel(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}
