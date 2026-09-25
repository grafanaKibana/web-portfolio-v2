import type {
  GradientRecipe,
  VariantDefinition,
} from "../gradient-background.models";
import { asRecord, pointsOption } from "../gradient-options.helpers";

/** Optional mesh controls; point order follows palette order. */
export interface MeshOptions {
  points?: readonly (readonly [number, number])[] | null;
}

/** Static AIR mesh with source palette, blur, grain, and fallback geometry. */
export const meshDefinition: VariantDefinition = {
  type: "AIR",
  label: "Mesh",
  animated: false,
  colors: ["#EAF4FC", "#B28FCE", "#F4B3C2", "#A0D8EF"],
  noise: 8,
  soften: 6,
  defaults: { points: null },
  controls: [
    {
      key: "points",
      label: "Mesh points",
      kind: "points",
      min: 0,
      max: 100,
    },
  ],
  /**
   * Maps complete palette-ordered points; absent points keep AIR's fallback cycle.
   * @param options - Untrusted mesh options.
   * @param colors - Palette used to validate point count.
   * @returns Mesh-specific recipe fields.
   */
  normalize(options: unknown, colors: readonly string[]): Partial<GradientRecipe> {
    const { points: value } = asRecord(options);
    if (value == null) {
      // AIR supplies its six-position cycle when mesh is absent.
      return {};
    }

    const points = pointsOption(value, colors.length, 0, 100);
    if (!points || points.some((point) => !(0 in point) || !(1 in point))) {
      throw new Error("Mesh points must contain one finite [x, y] pair per color.");
    }

    return { mesh: points };
  },
};
