import type {
  GradientRecipe,
  VariantDefinition,
} from "../gradient-background.models";
import { asRecord, numberOption } from "../gradient-options.helpers";

/** Controls the static colour field without exposing its generated coordinates. */
export interface StillOptions {
  positions?: number;
  mixing?: number;
  rotation?: number;
  grainMix?: number;
  waveX?: number;
  waveXShift?: number;
  waveY?: number;
  waveYShift?: number;
}

const defaults: Readonly<Required<StillOptions>> = {
  positions: 22,
  mixing: 78,
  rotation: 340,
  grainMix: 0,
  waveX: 95,
  waveXShift: 10,
  waveY: 100,
  waveYShift: 45,
};

/**
 * Maps Still editor dials to the SMESH renderer's raw percent/degrees params.
 * @param options - Untrusted variant options.
 * @returns Validated renderer parameters.
 */
function normalizeStill(options: unknown): Partial<GradientRecipe> {
  const input = asRecord(options);
  /**
   * Clamps and quantizes one step-one editor dial.
   * @param key - Public option key.
   * @param max - Inclusive upper bound.
   * @returns Normalized dial value.
   */
  const dial = (key: keyof StillOptions, max = 100): number =>
    Math.round(numberOption(input[key], defaults[key], 0, max));

  return {
    params: {
      positions: dial("positions"),
      mixing: dial("mixing"),
      rotation: dial("rotation", 360),
      grain: dial("grainMix"),
      waveX: dial("waveX"),
      waveXShift: dial("waveXShift"),
      waveY: dial("waveY"),
      waveYShift: dial("waveYShift"),
    },
  };
}

/** Static SMESH preset and editor-compatible control metadata. */
export const stillDefinition: VariantDefinition = {
  type: "SMESH",
  label: "Still",
  animated: false,
  colors: ["#FFF7F5", "#FFDDE4", "#FFB7C9", "#E98FB4", "#B76AA0", "#7A4E86"],
  noise: 6,
  soften: 0,
  defaults,
  controls: [
    { key: "positions", label: "Positions", kind: "number", min: 0, max: 100, step: 1 },
    { key: "mixing", label: "Mixing", kind: "number", min: 0, max: 100, step: 1 },
    { key: "rotation", label: "Rotation", kind: "number", min: 0, max: 360, step: 1 },
    { key: "grainMix", label: "Grain mix", kind: "number", min: 0, max: 100, step: 1 },
    { key: "waveX", label: "Wave X", kind: "number", min: 0, max: 100, step: 1 },
    { key: "waveXShift", label: "Shift X", kind: "number", min: 0, max: 100, step: 1 },
    { key: "waveY", label: "Wave Y", kind: "number", min: 0, max: 100, step: 1 },
    { key: "waveYShift", label: "Shift Y", kind: "number", min: 0, max: 100, step: 1 },
  ],
  normalize: normalizeStill,
};
