import { gradientVariantDefinitions } from "./gradient-background.config";
import type {
  GradientBackgroundInput,
  GradientRecipe,
  GradientVariant,
  NormalizedGradient,
  VariantDefinition,
} from "./gradient-background.models";
import { numberOption } from "./gradient-options.helpers";

const hexColorPattern = /^#(?:[\da-f]{3}|[\da-f]{6})$/i;
const omittedRecipeKeys = new Set([
  "asset",
  "assets",
  "font",
  "fontFamily",
  "image",
  "label",
  "logo",
  "text",
]);

/** Expands a supported hexadecimal color to uppercase six-digit form. */
function normalizeColor(color: string): string {
  if (!hexColorPattern.test(color)) {
    throw new Error(`Invalid gradient color: ${color}`);
  }

  const digits = color.slice(1);
  return `#${
    digits.length === 3
      ? `${digits.charAt(0).repeat(2)}${digits.charAt(1).repeat(2)}${digits.charAt(2).repeat(2)}`
      : digits
  }`.toUpperCase();
}

/** Normalizes and validates the public palette contract. */
function normalizeColors(colors: unknown): string[] {
  if (!Array.isArray(colors) || colors.length < 2 || colors.length > 6) {
    throw new Error("Gradient colors must contain between 2 and 6 hex colors.");
  }

  return colors.map((color) => {
    if (typeof color !== "string") {
      throw new Error("Gradient colors must be hex strings.");
    }

    return normalizeColor(color);
  });
}

/** Produces equally spaced internal palette divisions. */
function defaultBalance(colorCount: number): number[] {
  return Array.from(
    { length: colorCount - 1 },
    (_, index) => (index + 1) / colorCount,
  );
}

/** Applies editor-compatible bounds and separation to palette divisions. */
function normalizeBalance(value: unknown, colorCount: number): number[] {
  if (!Array.isArray(value)) {
    return defaultBalance(colorCount);
  }

  if (value.length !== colorCount - 1) {
    throw new Error("Gradient balance must have one fewer value than colors.");
  }

  const normalized: number[] = [];
  for (const [index, item] of value.entries()) {
    if (typeof item !== "number" || !Number.isFinite(item)) {
      return defaultBalance(colorCount);
    }

    const previous = normalized[index - 1];
    const lower = index === 0 ? 0.05 : (previous ?? 0.05) + 0.06;
    const remaining = value.length - index - 1;
    const upper = 0.95 - remaining * 0.06;
    normalized.push(Math.min(upper, Math.max(lower, item)));
  }

  return normalized;
}

/** Copies recipe data while excluding upstream text and remote asset fields. */
function sanitizeRecipeFields(
  value: Partial<GradientRecipe>,
): Partial<GradientRecipe> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !omittedRecipeKeys.has(key)),
  );
}

/** Recursively orders object keys for semantic configuration identity. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }

  return value;
}

/** Builds a deterministic CSS fallback from the normalized palette. */
function fallbackBackground(colors: readonly string[]): string {
  return `linear-gradient(135deg, ${colors.join(", ")})`;
}

/** Resolves an unknown public identifier to its registered adapter. */
function resolveDefinition(value: unknown): [GradientVariant, VariantDefinition] {
  if (
    typeof value !== "string" ||
    !Object.hasOwn(gradientVariantDefinitions, value)
  ) {
    throw new Error(`Unknown gradient variant: ${String(value)}`);
  }

  const variant = value as GradientVariant;
  return [variant, gradientVariantDefinitions[variant]];
}

/** Normalizes public gradient props into an engine recipe and stable identity. */
export function normalizeGradient(input: unknown): NormalizedGradient {
  if (input === null || typeof input !== "object") {
    throw new Error("Gradient configuration must be an object.");
  }

  const config = input as GradientBackgroundInput;
  const [variant, definition] = resolveDefinition(config.variant);
  const colors = normalizeColors(config.colors ?? definition.colors);
  const divs = normalizeBalance(config.balance, colors.length);
  const grain = numberOption(config.noise, definition.noise, 0, 100);
  const soften = numberOption(config.soften, definition.soften, 0, 80);
  const animated = definition.animated && config.animated !== false;
  const variantRecipe = sanitizeRecipeFields(
    definition.normalize(config.options, colors),
  );
  let recipeSpeed = 0;
  if (typeof variantRecipe.speed === "number") {
    recipeSpeed = variantRecipe.speed;
  } else if (definition.animated) {
    recipeSpeed = 50;
  }
  const recipe: GradientRecipe = {
    ...variantRecipe,
    type: definition.type,
    name: variant,
    width: 1600,
    height: 900,
    stops: colors,
    divs,
    grain,
    fieldBlur: soften,
    blur: soften,
    speed: recipeSpeed,
    startT: 20.75,
    animated: definition.animated,
    lines: Array.isArray(variantRecipe.lines) ? variantRecipe.lines : [],
    soften,
  };
  const speed = numberOption(recipe.speed, 0, 0, 100);
  recipe.speed = speed;
  const visualRecipe = Object.fromEntries(
    Object.entries(recipe).filter(
      ([key]) => key !== "animated" && key !== "speed",
    ),
  );
  const identity = JSON.stringify(canonicalize(visualRecipe));

  return {
    recipe,
    speed,
    paused: !animated || speed === 0,
    identity,
    fallback: fallbackBackground(colors),
  };
}
