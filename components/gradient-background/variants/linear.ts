import type {
  GradientRecipe,
  VariantDefinition,
} from "../gradient-background.models";

/** Linear has no variant-specific options; palette and finish controls are shared. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- No variant-specific options exist.
export interface LinearOptions {}

/** Static top-to-bottom linear gradient using the source editor's default preset. */
export const linearDefinition: VariantDefinition = {
  type: "LINEAR",
  label: "Linear",
  animated: false,
  colors: ["#B28FCE", "#FEF4F4"],
  noise: 12,
  soften: 6,
  defaults: {},
  controls: [],

  /**
   * Leaves shared palette, balance, noise, and soften normalization to the facade.
   * @param _options - Unused variant options.
   * @param _colors - Palette normalized by the shared facade.
   * @returns An empty variant-specific recipe.
   */
  normalize(
    _options: unknown,
    _colors: readonly string[],
  ): Partial<GradientRecipe> {
    return {};
  },
};
