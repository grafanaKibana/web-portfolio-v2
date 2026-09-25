import { conicDefinition } from "./variants/conic";
import { flowDefinition } from "./variants/flow";
import { glowDefinition } from "./variants/glow";
import { iosDefinition } from "./variants/ios";
import { linearDefinition } from "./variants/linear";
import { meshDefinition } from "./variants/mesh";
import { mistDefinition } from "./variants/mist";
import { pixelDefinition } from "./variants/pixel";
import { radialDefinition } from "./variants/radial";
import { ringsDefinition } from "./variants/rings";
import { skyDefinition } from "./variants/sky";
import { stillDefinition } from "./variants/still";
import type {
  GradientVariant,
  VariantDefinition,
} from "./gradient-background.models";

/** Maps public variant names to their renderer adapters. */
export const gradientVariantDefinitions = {
  flow: flowDefinition,
  sky: skyDefinition,
  mesh: meshDefinition,
  still: stillDefinition,
  ios: iosDefinition,
  linear: linearDefinition,
  glow: glowDefinition,
  rings: ringsDefinition,
  pixel: pixelDefinition,
  radial: radialDefinition,
  conic: conicDefinition,
  mist: mistDefinition,
} as const satisfies Record<GradientVariant, VariantDefinition>;

/** Public metadata for a selectable gradient variant. */
export interface GradientVariantDescriptor
  extends Omit<VariantDefinition, "type" | "normalize"> {
  type: GradientVariant;
  engineType: string;
}

/** Ordered metadata used by consumers that render variant controls. */
export const gradientVariants: readonly GradientVariantDescriptor[] = (
  Object.entries(gradientVariantDefinitions) as [
    GradientVariant,
    VariantDefinition,
  ][]
).map(([type, definition]) => ({
  type,
  engineType: definition.type,
  label: definition.label,
  animated: definition.animated,
  colors: definition.colors,
  noise: definition.noise,
  soften: definition.soften,
  defaults: definition.defaults,
  controls: definition.controls,
}));
