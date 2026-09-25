"use client";

import { useLayoutEffect } from "react";
import FeralGradientRuntime, {
  paintRecipe,
  type FeralGradientRuntimeProps,
} from "./feral-gradient-runtime.jsx";
import {
  FeralGradientCss,
  getFeralCssBackground,
  isFeralCssRecipe,
} from "./feral-gradient-css";

/** Props accepted by the shared upstream renderer dispatch boundary. */
export interface FeralGradientEngineProps extends FeralGradientRuntimeProps {
  /** Reports that the static Still renderer has committed its final initial frame. */
  onStillReady?: () => void;
}

/**
 * Dispatches recipes to the same Canvas/WebGL or CSS path used by the export source.
 *
 * @param props - Recipe and renderer lifecycle properties.
 * @returns The renderer selected for the recipe type.
 */
export default function FeralGradientEngine(props: FeralGradientEngineProps) {
  const { recipe, onStillReady } = props;
  useLayoutEffect(() => {
    if (recipe.type === "SMESH") onStillReady?.();
  }, [recipe, onStillReady]);

  return isFeralCssRecipe(props.recipe) ? (
    <FeralGradientCss {...props} />
  ) : (
    <FeralGradientRuntime {...props} />
  );
}

export { getFeralCssBackground, isFeralCssRecipe, paintRecipe };
