import type { StillOptions } from "@/components/gradient-background";
import { resolveHeroContrast } from "./hero-contrast";

/** Matcha Cream in light mode; muted charcoal and moss greens in Deep Moss dark mode. */
export const heroPalettes = {
  light: ["#F8F6EC", "#E3E9D6", "#BDD5B3", "#8BB58B", "#568F68", "#295D48"],
  dark: ["#0E120F", "#171E18", "#232D24", "#313D30", "#45533E", "#1C2721"],
};

/** Theme-specific grain overlay strength, expressed as a percentage. */
export const heroNoise = { light: 7, dark: 10 };

/** Vertical page-color fade shared by the generated fallback and live renderer. */
export const heroFadeStops = [
  [0, 0],
  [0.18, 0],
  [0.30, 0.03],
  [0.44, 0.13],
  [0.58, 0.33],
  [0.72, 0.60],
  [0.86, 0.85],
  [0.95, 0.97],
  [1, 1],
] as const;

/** Derived foreground roles account for the palette and grain overlay in both themes. */
export const heroContrast = {
  light: resolveHeroContrast(heroPalettes.light, heroNoise.light),
  dark: resolveHeroContrast(heroPalettes.dark, heroNoise.dark),
};

/** Approved Still geometry shapes broad, softly mixed bands with subtle grain. */
export const heroStillOptions = {
  positions: 77,
  mixing: 60,
  rotation: 0,
  grainMix: 5,
  waveX: 87,
  waveXShift: 20,
  waveY: 85,
  waveYShift: 60,
} satisfies StillOptions;

/** Deep Moss retains the light field's geometry with more visible spatial grain. */
export const heroDarkStillOptions = { ...heroStillOptions, grainMix: 15 } satisfies StillOptions;
