import type {
  GradientRecipe,
  VariantDefinition,
} from "../gradient-background.models";
import { asRecord, numberOption, pointsOption } from "../gradient-options.helpers";

/** Public controls for the Flow field and its optional palette-aligned spots. */
export interface FlowOptions {
  scale?: number;
  distortion?: number;
  swirl?: number;
  speed?: number;
  points?: readonly (readonly [number, number])[] | null;
}

/** Flow's source-editor defaults, controls, and engine recipe projection. */
export const flowDefinition: VariantDefinition = {
  type: "FLOW",
  label: "Flow",
  animated: true,
  colors: ["#EAF4FC", "#1E50A2", "#F09199", "#895B8A"],
  noise: 6,
  soften: 0,
  defaults: { scale: 50, distortion: 60, swirl: 10, speed: 30, points: null },
  controls: [
    { key: "scale", label: "Scale", kind: "number", min: 0, max: 100, step: 1 },
    { key: "distortion", label: "Distortion", kind: "number", min: 0, max: 100, step: 1 },
    { key: "swirl", label: "Swirl", kind: "number", min: 0, max: 100, step: 1 },
    { key: "speed", label: "Speed", kind: "number", min: 0, max: 100, step: 1 },
    { key: "points", label: "Points", kind: "points" },
  ],
  /** Maps validated editor values to the source Flow renderer's recipe fields. */
  normalize(options: unknown, colors: readonly string[]): Partial<GradientRecipe> {
    const raw = asRecord(options);
    let mesh: number[][] | null = null;
    if (raw.points !== undefined && raw.points !== null) {
      const points = pointsOption(raw.points, colors.length);
      if (!points) {
        throw new Error("Flow points must contain one finite [x, y] pair per color.");
      }
      mesh = points;
    }

    return {
      params: {
        scale: Math.round(numberOption(raw.scale, 50, 0, 100)),
        distortion: Math.round(numberOption(raw.distortion, 60, 0, 100)),
        swirl: Math.round(numberOption(raw.swirl, 10, 0, 100)),
      },
      speed: Math.round(numberOption(raw.speed, 30, 0, 100)),
      mesh,
    };
  },
};
