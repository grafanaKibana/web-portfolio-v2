import type { GradientRecipe, VariantDefinition } from "../gradient-background.models";
import { asRecord, enumOption, numberOption } from "../gradient-options.helpers";

/** Editor options for the three Pixel rendering styles. */
export interface PixelOptions {
  style?: "quilt" | "orbs" | "glass";
  size?: number;
  speed?: number;
  quilt?: { steps?: number; weave?: number };
  orbs?: { gap?: number; roundness?: number; glow?: number };
  glass?: { fill?: number };
}

const styles = ["quilt", "orbs", "glass"] as const;

/**
 * Validates a style-specific options object before reading its controls.
 * @param value - Untrusted style options.
 * @param style - Active style name used in diagnostics.
 * @returns A record containing the style controls.
 */
function styleOptions(value: unknown, style: string): Record<string, unknown> {
  if (value === undefined) return {};
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Pixel ${style} options must be an object.`);
  }
  return asRecord(value);
}

/** Preserves Pixel's editor controls while mapping them to the canvas recipe. */
export const pixelDefinition: VariantDefinition = {
  type: "PIXEL",
  label: "Pixel",
  animated: true,
  colors: ["#DE1D74", "#E85B9E", "#F292C4", "#F8C4DD", "#F7EEF3"],
  noise: 6,
  soften: 0,
  defaults: {
    style: "quilt",
    size: 40,
    speed: 30,
    quilt: { steps: 12, weave: 20 },
    orbs: { gap: 4, roundness: 100, glow: 45 },
    glass: { fill: 50 },
  },
  controls: [
    { key: "style", label: "Style", kind: "select", choices: styles },
    { key: "size", label: "Blocks / size", kind: "number", min: 0, max: 100, step: 1 },
    { key: "speed", label: "Speed", kind: "number", min: 0, max: 100, step: 1 },
    { key: "quilt.steps", label: "Steps", kind: "number", min: 2, max: 16, step: 1 },
    { key: "quilt.weave", label: "Weave", kind: "number", min: 0, max: 100, step: 1 },
    { key: "orbs.gap", label: "Gap", kind: "number", min: 0, max: 30, step: 1 },
    { key: "orbs.roundness", label: "Roundness", kind: "number", min: 0, max: 100, step: 1 },
    { key: "orbs.glow", label: "Glow", kind: "number", min: 0, max: 100, step: 1 },
    { key: "glass.fill", label: "Fill", kind: "number", min: 0, max: 100, step: 1 },
  ],
  /**
   * Maps the active Pixel style to its renderer fields.
   * @param options - Untrusted Pixel options.
   * @param _colors - Palette normalized by the shared facade.
   * @returns Pixel-specific recipe fields.
   */
  normalize(options: unknown, _colors: readonly string[]): Partial<GradientRecipe> {
    const input = asRecord(options);
    const style = enumOption(input.style, styles, "quilt");
    const current = styleOptions(input[style], style);
    /**
     * Returns one rounded style control within its editor bounds.
     * @param key - Style control key.
     * @param fallback - Value used when the control is not finite.
     * @param min - Lowest accepted value.
     * @param max - Highest accepted value.
     * @returns Rounded and bounded style control value.
     */
    const integer = (key: string, fallback: number, min: number, max: number) =>
      Math.round(numberOption(current[key], fallback, min, max));
    const common = {
      pixelStyle: style,
      size: Math.round(numberOption(input.size, 40, 0, 100)),
      speed: Math.round(numberOption(input.speed, 30, 0, 100)),
    };

    if (style === "orbs") {
      return {
        ...common,
        cover: integer("gap", 4, 0, 30),
        rings: integer("roundness", 100, 0, 100),
        weave: integer("glow", 45, 0, 100),
      };
    }
    if (style === "glass") {
      return { ...common, cover: integer("fill", 50, 0, 100), rings: 12, weave: 20 };
    }
    return {
      ...common,
      cover: 50,
      rings: integer("steps", 12, 2, 16),
      weave: integer("weave", 20, 0, 100),
    };
  },
};
