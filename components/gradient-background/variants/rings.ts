import type {
  GradientRecipe,
  VariantDefinition,
} from "../gradient-background.models";
import { asRecord, numberOption } from "../gradient-options.helpers";

/** Direction coordinates used to offset the ripple center, not literal center coordinates. */
export interface RingsOrigin {
  x?: number;
  y?: number;
}

/** Public controls for the static ripple gradient. */
export interface RingsOptions {
  count?: number;
  melt?: number;
  glow?: number;
  sweep?: number;
  origin?: RingsOrigin;
}

/** Adapts the Ripple editor preset to the RING canvas recipe. */
export const ringsDefinition: VariantDefinition = {
  type: "RING",
  label: "Rings",
  animated: false,
  colors: ["#EBF6F7", "#A2D7DD", "#00A3AF", "#274A78"],
  noise: 8,
  soften: 5,
  defaults: { count: 12, melt: 8, glow: 100, sweep: 100, origin: { x: 0, y: 0 } },
  controls: [
    { key: "count", label: "Ripple count", kind: "number", min: 5, max: 24, step: 1 },
    { key: "melt", label: "Melt", kind: "number", min: 0, max: 100, step: 1 },
    { key: "glow", label: "Glow", kind: "number", min: 0, max: 100, step: 1 },
    { key: "sweep", label: "Sweep", kind: "number", min: 0, max: 100, step: 1 },
    { key: "origin.x", label: "Origin horizontal", kind: "number", min: 0, max: 1, step: 0.01 },
    { key: "origin.y", label: "Origin vertical", kind: "number", min: 0, max: 1, step: 0.01 },
  ],
  /**
   * Maps public ripple controls to bounded renderer parameters.
   * @param options - Untrusted ripple options.
   * @returns Rings-specific recipe fields.
   */
  normalize(options: unknown): Partial<GradientRecipe> {
    const values = asRecord(options);
    if (
      values.origin !== undefined &&
      (values.origin === null ||
        typeof values.origin !== "object" ||
        Array.isArray(values.origin))
    ) {
      throw new Error("Rings origin must be an object with x and y coordinates.");
    }

    const origin = asRecord(values.origin);
    return {
      params: {
        count: Math.round(numberOption(values.count, 12, 5, 24)),
        melt: Math.round(numberOption(values.melt, 8, 0, 100)),
        glow: Math.round(numberOption(values.glow, 100, 0, 100)),
        sweep: Math.round(numberOption(values.sweep, 100, 0, 100)),
        dirX: Math.round(numberOption(origin.x, 0, 0, 1) * 100) / 100,
        dirY: Math.round(numberOption(origin.y, 0, 0, 1) * 100) / 100,
      },
    };
  },
};
