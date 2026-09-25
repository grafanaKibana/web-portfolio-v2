import type { StillOptions } from "@/components/gradient-background";
import { resolveHeroContrast } from "./hero-contrast";

/** Matcha Cream in light mode; emerald, jade, and teal from the dark theme's accent family. */
export const heroPalettes = {
  light: ["#F8F6EC", "#E3E9D6", "#BDD5B3", "#8BB58B", "#568F68", "#295D48"],
  dark: ["#0B2A23", "#10503C", "#19664A", "#248569", "#237F79", "#12453F"],
};

/** Shared grain overlay strength, expressed as a percentage. */
export const heroNoise = 7;

/** Derived foregrounds account for the palette and grain overlay in both themes. */
export const heroContrast = {
  light: resolveHeroContrast(heroPalettes.light, heroNoise),
  dark: resolveHeroContrast(heroPalettes.dark, heroNoise),
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
