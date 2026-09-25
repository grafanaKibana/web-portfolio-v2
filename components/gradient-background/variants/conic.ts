import type {
  GradientRecipe,
  VariantDefinition,
} from "../gradient-background.models";

/** Conic has no variant-specific options; palette and finish use shared props. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ConicOptions {}

/** Static conic recipe with the reference editor's palette and finish defaults. */
export const conicDefinition: VariantDefinition = {
  type: "ANGULAR",
  label: "Conic",
  animated: false,
  colors: ["#316745", "#68BE8D", "#A2D7DD", "#EBF6F7"],
  noise: 10,
  soften: 4,
  defaults: {},
  controls: [],
  /**
   * Leaves palette balance and finish normalization to the shared adapter.
   *
   * @param _options - Ignored because the reference exposes no conic options.
   * @param _colors - Ignored because shared normalization owns the palette.
   * @returns No variant-specific recipe fields.
   */
  normalize(_options: unknown, _colors: readonly string[]): Partial<GradientRecipe> {
    return {};
  },
};
