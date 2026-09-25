import type { GradientBackgroundSharedProps } from "./gradient-background.models";
import type { ConicOptions } from "./variants/conic";
import type { FlowOptions } from "./variants/flow";
import type { GlowOptions } from "./variants/glow";
import type { IosOptions } from "./variants/ios";
import type { LinearOptions } from "./variants/linear";
import type { MeshOptions } from "./variants/mesh";
import type { MistOptions } from "./variants/mist";
import type { PixelOptions } from "./variants/pixel";
import type { RadialOptions } from "./variants/radial";
import type { RingsOptions } from "./variants/rings";
import type { SkyOptions } from "./variants/sky";
import type { StillOptions } from "./variants/still";

/** Maps every public variant to its correlated options object. */
export interface GradientBackgroundOptions {
  flow: FlowOptions;
  sky: SkyOptions;
  mesh: MeshOptions;
  still: StillOptions;
  ios: IosOptions;
  linear: LinearOptions;
  glow: GlowOptions;
  rings: RingsOptions;
  pixel: PixelOptions;
  radial: RadialOptions;
  conic: ConicOptions;
  mist: MistOptions;
}

/** Builds one discriminated props member for a variant and its options. */
type VariantProps<Name extends keyof GradientBackgroundOptions> =
  GradientBackgroundSharedProps & {
    variant: Name;
    options?: GradientBackgroundOptions[Name];
  };

/** Type-safe public props accepted by GradientBackground. */
export type GradientBackgroundProps = {
  [Name in keyof GradientBackgroundOptions]: VariantProps<Name>;
}[keyof GradientBackgroundOptions];
