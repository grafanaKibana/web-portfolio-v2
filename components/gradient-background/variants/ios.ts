import type { VariantDefinition } from "../gradient-background.models";

/** iOS has no variant-specific options beyond shared palette and finish controls. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface IosOptions {}

/** Static iOS silk gradient metadata and recipe adapter. */
export const iosDefinition: VariantDefinition = {
  type: "IOS",
  label: "iOS",
  animated: false,
  colors: ["#4C6CB3", "#B28FCE", "#F4B3C2"],
  noise: 14,
  soften: 12,
  defaults: {},
  controls: [],
  /** Leaves shared palette and finish controls to the facade. */
  normalize: () => ({}),
};
