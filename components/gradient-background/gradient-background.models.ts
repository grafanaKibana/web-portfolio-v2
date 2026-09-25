import type { CSSProperties } from "react";

/** Supported public gradient identifiers. */
export type GradientVariant =
  | "flow"
  | "sky"
  | "mesh"
  | "still"
  | "ios"
  | "linear"
  | "glow"
  | "rings"
  | "pixel"
  | "radial"
  | "conic"
  | "mist";

/** Describes one editor control exposed by a gradient variant. */
export interface GradientControl {
  key: string;
  label: string;
  kind: "number" | "select" | "boolean" | "points" | "shapes";
  min?: number;
  max?: number;
  step?: number;
  choices?: readonly string[];
}

/** Canonical recipe consumed by the vendored gradient renderer. */
export interface GradientRecipe {
  type: string;
  name: string;
  width: number;
  height: number;
  stops: string[];
  divs: number[];
  grain: number;
  fieldBlur: number;
  blur: number;
  speed: number;
  startT: number;
  animated: boolean;
  lines: Record<string, unknown>[];
  [key: string]: unknown;
}

/** Contract implemented by every variant adapter. */
export interface VariantDefinition {
  type: string;
  label: string;
  animated: boolean;
  colors: readonly string[];
  noise: number;
  soften: number;
  defaults: Readonly<Record<string, unknown>>;
  controls: readonly GradientControl[];
  normalize(
    options: unknown,
    colors: readonly string[],
  ): Partial<GradientRecipe>;
}

/** Shared properties accepted by every gradient variant. */
export interface GradientBackgroundSharedProps {
  colors?: readonly string[];
  balance?: readonly number[];
  noise?: number;
  soften?: number;
  animated?: boolean;
  className?: string;
  style?: CSSProperties;
  onError?: (error: Error) => void;
}

/** Runtime-normalizable subset of the public discriminated props union. */
export interface GradientBackgroundInput extends GradientBackgroundSharedProps {
  variant: unknown;
  options?: unknown;
}

/** Normalized configuration used by the client facade. */
export interface NormalizedGradient {
  recipe: GradientRecipe;
  speed: number;
  paused: boolean;
  identity: string;
  fallback: string;
}
