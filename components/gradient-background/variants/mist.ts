import type { GradientRecipe, VariantDefinition } from "../gradient-background.models";
import { asRecord, numberOption } from "../gradient-options.helpers";

/** Public mountain and fog controls for the Mist gradient. */
export interface MistOptions {
  rangeDensity?: number;
  skyShare?: number;
  peakHeight?: number;
  peakProfile?: number;
  fogDensity?: number;
  sunPosition?: number;
  drift?: number;
  seed?: number;
}

/** Mist preset and editor-to-recipe mapping. */
export const mistDefinition: VariantDefinition = {
  type: "MIST",
  label: "Mist",
  animated: true,
  colors: ["#FBF2E2", "#F3DDC2", "#D9BCAE", "#B08F9B", "#7A6483", "#463A5E"],
  noise: 12,
  soften: 0,
  defaults: {
    rangeDensity: 33,
    skyShare: 0.42,
    peakHeight: 50,
    peakProfile: 55,
    fogDensity: 50,
    sunPosition: 64,
    drift: 55,
    seed: 7,
  },
  controls: [
    { key: "rangeDensity", label: "Ranges", kind: "number", min: 0, max: 100, step: 1 },
    { key: "skyShare", label: "Sky share", kind: "number", min: 0.2, max: 0.58, step: 0.01 },
    { key: "peakHeight", label: "Peak height", kind: "number", min: 0, max: 100, step: 1 },
    { key: "peakProfile", label: "Peak profile", kind: "number", min: 0, max: 100, step: 1 },
    { key: "fogDensity", label: "Fog density", kind: "number", min: 0, max: 100, step: 1 },
    { key: "sunPosition", label: "Sun position", kind: "number", min: 0, max: 100, step: 1 },
    { key: "drift", label: "Fog drift", kind: "number", min: 0, max: 100, step: 1 },
    { key: "seed", label: "Mountain seed", kind: "number", step: 1 },
  ],
  /**
   * Maps Mist controls to the renderer's mountain and fog fields.
   * @param options - Untrusted Mist options.
   * @param _colors - Palette normalized by the shared facade.
   * @returns Mist-specific recipe fields.
   */
  normalize(options: unknown, _colors: readonly string[]): Partial<GradientRecipe> {
    const input = asRecord(options);
    const seed = numberOption(input.seed, 7, -Infinity, Infinity);

    return {
      size: numberOption(input.rangeDensity, 33, 0, 100),
      glintHorizon: numberOption(input.skyShare, 0.42, 0.2, 0.58),
      mist: {
        height: numberOption(input.peakHeight, 50, 0, 100),
        sharp: numberOption(input.peakProfile, 55, 0, 100),
        haze: numberOption(input.fogDensity, 50, 0, 100),
        sun: numberOption(input.sunPosition, 64, 0, 100),
        drift: numberOption(input.drift, 55, 0, 100),
        seed: Math.trunc(seed),
      },
    };
  },
};
