const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Accepts only normalized slugs that are safe for local content lookup.
 *
 * @param value - Candidate slug to validate.
 * @param source - Source name used in validation diagnostics.
 * @returns The unchanged normalized slug.
 * @throws Error when the slug is not normalized or contains unsafe characters.
 */
export function validateSlug(value: string, source = "slug"): string {
  if (!slugPattern.test(value)) {
    throw new Error(
      `${source}: slug "${value}" must contain only lowercase letters, numbers, and single hyphens`,
    );
  }

  return value;
}
