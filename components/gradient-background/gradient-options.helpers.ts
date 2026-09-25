/**
 * Returns a plain record or an empty record for unsupported input.
 *
 * @param value - Candidate record value.
 * @returns The plain record or an empty record.
 */
export function asRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

/**
 * Normalizes a finite numeric option within inclusive bounds.
 *
 * @param value - Candidate numeric option.
 * @param fallback - Value used when the candidate is not finite.
 * @param min - Inclusive lower bound.
 * @param max - Inclusive upper bound.
 * @returns The fallback or bounded numeric option.
 */
export function numberOption(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

/**
 * Selects an allowed string option or its fallback.
 *
 * @typeParam T - Allowed string option type.
 * @param value - Candidate string option.
 * @param choices - Allowed option values.
 * @param fallback - Value used when the candidate is not allowed.
 * @returns The allowed candidate or fallback.
 */
export function enumOption<T extends string>(
  value: unknown,
  choices: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" && choices.includes(value as T)
    ? (value as T)
    : fallback;
}

/**
 * Validates and clamps a fixed-length collection of two-dimensional points.
 *
 * @param value - Candidate point collection.
 * @param count - Required number of points.
 * @param min - Inclusive coordinate lower bound.
 * @param max - Inclusive coordinate upper bound.
 * @returns The bounded points, or undefined when validation fails.
 */
export function pointsOption(
  value: unknown,
  count: number,
  min = 3,
  max = 97,
): number[][] | undefined {
  if (!Array.isArray(value) || value.length !== count) {
    return undefined;
  }

  const points: number[][] = [];
  for (const point of value) {
    if (!Array.isArray(point) || point.length !== 2) {
      return undefined;
    }

    const x: unknown = point[0];
    const y: unknown = point[1];
    if (
      typeof x !== "number" ||
      !Number.isFinite(x) ||
      typeof y !== "number" ||
      !Number.isFinite(y)
    ) {
      return undefined;
    }

    points.push([
      Math.min(max, Math.max(min, x)),
      Math.min(max, Math.max(min, y)),
    ]);
  }

  return points;
}
