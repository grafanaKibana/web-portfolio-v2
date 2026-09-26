/** Foreground and optional neutral veil that protect text over an sRGB palette. */
export interface HeroContrastResult {
  contentForeground: string;
  foreground: "#000000" | "#ffffff";
  minimumContrast: number;
  mutedForeground: string;
  surface: "#ffffff" | "#000000";
  veilOpacity: number;
}

const heroInks = {
  black: {
    contentForeground: "#080808",
    foreground: "#000000" as const,
    mutedForeground: "#141414",
    surface: "#ffffff" as const,
  },
  white: {
    contentForeground: "#f7f7f7",
    foreground: "#ffffff" as const,
    mutedForeground: "#ebebeb",
    surface: "#000000" as const,
  },
};

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
    const blackBackground = lower.map((value) => value * (1 - alpha) + alpha);
    const whiteBackground = upper.map((value) => value * (1 - alpha));
    const blackContrast = minimumInkContrast(heroInks.black, blackBackground);
    const whiteContrast = minimumInkContrast(heroInks.white, whiteBackground);
    // A small margin protects against browser rounding at the AA boundary.
    if (Math.max(blackContrast, whiteContrast) >= 4.6) {
      const black = blackContrast >= whiteContrast;
      const inks = black ? heroInks.black : heroInks.white;
      return {
        ...inks,
        veilOpacity: alpha,
        minimumContrast: black ? blackContrast : whiteContrast,
      };
    }
  }
  throw new Error("Unable to establish hero contrast.");
}

/**
 * Finds the weakest contrast among one hero ink hierarchy.
 *
 * @param inks - Solid foreground roles sharing one light or dark polarity.
 * @param background - Worst-case composited hero background channels.
 * @returns The lowest contrast ratio in the hierarchy.
 */
function minimumInkContrast(
  inks: { contentForeground: string; foreground: string; mutedForeground: string },
  background: number[],
) {
  return Math.min(
    ...[inks.foreground, inks.contentForeground, inks.mutedForeground]
      .map((ink) => contrast(hexChannels(ink), background)),
  );
}

/**
 * Parses a six-digit hexadecimal color into normalized sRGB channels.
 *
 * @param value - Six-digit hexadecimal color.
 * @returns Red, green, and blue channels in the unit interval.
 */
function hexChannels(value: string) {
  return [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
}

/**
 * Calculates the WCAG contrast ratio between two normalized sRGB colors.
 *
 * @param foreground - Foreground RGB channels in the unit interval.
 * @param background - Background RGB channels in the unit interval.
 * @returns WCAG contrast ratio.
 */
function contrast(foreground: number[], background: number[]) {
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
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

/** Decodes a unit sRGB channel into linear light.
 * @param value - Normalized sRGB channel.
 * @returns Linear-light channel in the unit interval.
 */
function linearChannel(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}
