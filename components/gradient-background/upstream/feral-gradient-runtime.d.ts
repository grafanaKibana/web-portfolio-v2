import type { CSSProperties, ComponentType } from "react";

import type { GradientRecipe } from "../gradient-background.models";

/** Props accepted by the locally adapted generated Feral runtime. */
export interface FeralGradientRuntimeProps {
  recipe: GradientRecipe;
  className?: string;
  style?: CSSProperties;
  speed?: number;
  paused?: boolean;
  onError?: (error: Error) => void;
}

/**
 * Paints one recipe into an existing canvas at a controlled time.
 *
 * @param canvas - Destination canvas element.
 * @param recipe - Gradient recipe to paint.
 * @param time - Optional controlled animation time.
 */
export function paintRecipe(
  canvas: HTMLCanvasElement,
  recipe: GradientRecipe,
  time?: number,
): void;

declare const FeralGradientRuntime: ComponentType<FeralGradientRuntimeProps>;

export default FeralGradientRuntime;
