import type {
  GradientRecipe,
  VariantDefinition,
} from "../gradient-background.models";

/** Radial exposes no controls beyond the shared palette, balance, and finish props. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- The source editor has no radial-only controls.
export interface RadialOptions {}

/** Static centered radial gradient from the source editor's default preset. */
export const radialDefinition: VariantDefinition = {
  type: "CIRCLE",
  label: "Radial",
  animated: false,
  colors: ["#EAF4FC", "#A2D7DD", "#4C6CB3", "#181B3A"],
  noise: 12,
  soften: 10,
  defaults: {},
  controls: [],
  /**
   * Leaves fixed radial geometry to the renderer and shared controls to the facade.
   *
   * @param _options - Ignored because radial has no variant-only controls.
   * @param _colors - Palette already normalized by the shared facade.
   * @returns No variant-specific recipe fields.
   */
  normalize(
    _options: unknown,
    _colors: readonly string[],
  ): Partial<GradientRecipe> {
    return {};
  },
};
