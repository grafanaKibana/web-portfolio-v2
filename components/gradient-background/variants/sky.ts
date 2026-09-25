import type {
  GradientRecipe,
  VariantDefinition,
} from "../gradient-background.models";
import { asRecord, enumOption, numberOption } from "../gradient-options.helpers";

/** Public controls for Sky's animated weather field. */
export interface SkyOptions {
  scale?: number;
  warp?: number;
  wind?: number;
  speed?: number;
  direction?: "up" | "right" | "down" | "left";
}

/** Sky's source-editor defaults, controls, and engine recipe projection. */
export const skyDefinition: VariantDefinition = {
  type: "SKY",
  label: "Sky",
  animated: true,
  colors: ["#E6F2FF", "#B3D9FF", "#80B3FF", "#6699E6"],
  noise: 4,
  soften: 0,
  defaults: { scale: 45, warp: 50, wind: 40, speed: 22, direction: "up" },
  controls: [
    { key: "scale", label: "Scale", kind: "number", min: 0, max: 100, step: 1 },
    { key: "warp", label: "Warp", kind: "number", min: 0, max: 100, step: 1 },
    { key: "wind", label: "Wind", kind: "number", min: 0, max: 100, step: 1 },
    { key: "speed", label: "Speed", kind: "number", min: 0, max: 100, step: 1 },
    {
      key: "direction",
      label: "Weather direction",
      kind: "select",
      choices: ["up", "right", "down", "left"],
    },
  ],
  /**
   * Maps validated editor values to the Sky renderer's weather parameters.
   * @param options - Untrusted Sky options.
   * @param _colors - Palette normalized by the shared facade.
   * @returns Sky-specific recipe fields.
   */
  normalize(options: unknown, _colors: readonly string[]): Partial<GradientRecipe> {
    const raw = asRecord(options);
    const direction = enumOption(
      raw.direction,
      ["up", "right", "down", "left"] as const,
      "up",
    );

    return {
      params: {
        scale: Math.round(numberOption(raw.scale, 45, 0, 100)),
        distortion: Math.round(numberOption(raw.warp, 50, 0, 100)),
        swirl: Math.round(numberOption(raw.wind, 40, 0, 100)),
        dir: { up: 0, right: 1, down: 2, left: 3 }[direction],
      },
      speed: Math.round(numberOption(raw.speed, 22, 0, 100)),
    };
  },
};
