import type {
  ArticleMetadata,
  ContentMetadata,
  ProjectMetadata,
} from "./types";

const commonFields = new Set([
  "kind",
  "title",
  "description",
  "updated",
  "tags",
]);

/**
 * Throws a source-specific metadata validation error.
 *
 * @param source - Content source being validated.
 * @param field - Metadata field that failed validation.
 * @param message - Explanation of the validation failure.
 * @throws Error with source and field context.
 */
function fail(source: string, field: string, message: string): never {
  throw new Error(`${source}: metadata.${field} ${message}`);
}

/**
 * Narrows unknown metadata to a plain record.
 *
 * @param value - Unknown metadata value.
 * @param source - Content source used in diagnostics.
 * @returns The metadata as a plain record.
 * @throws Error when metadata is not a plain object.
 */
function record(value: unknown, source: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${source}: metadata must be an object`);
  }

  return value as Record<string, unknown>;
}

/**
 * Requires and trims a non-empty metadata string.
 *
 * @param value - Unknown field value.
 * @param source - Content source used in diagnostics.
 * @param field - Metadata field being validated.
 * @returns The trimmed string.
 * @throws Error when the field is not a non-empty string.
 */
function text(
  value: unknown,
  source: string,
  field: string,
): string {
  if (typeof value !== "string" || value.trim() === "") {
    fail(source, field, "must be a non-empty string");
  }

  return value.trim();
}

/**
 * Validates an exact UTC calendar date.
 *
 * @param value - Unknown date value.
 * @param source - Content source used in diagnostics.
 * @param field - Metadata field being validated.
 * @returns The validated `YYYY-MM-DD` date.
 * @throws Error when the value is not a valid calendar date.
 */
function date(value: unknown, source: string, field: string): string {
  const normalized = text(value, source, field);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    fail(source, field, "must use YYYY-MM-DD format");
  }

  const parsed = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== normalized) {
    fail(source, field, "must be a valid calendar date");
  }

  return normalized;
}

/**
 * Validates an optional date with the shared calendar rules.
 *
 * @param value - Unknown optional date value.
 * @param source - Content source used in diagnostics.
 * @param field - Metadata field being validated.
 * @returns The validated date, or `undefined` when omitted.
 * @throws Error when a provided value is not a valid calendar date.
 */
function optionalDate(
  value: unknown,
  source: string,
  field: string,
): string | undefined {
  return value === undefined ? undefined : date(value, source, field);
}

/**
 * Validates optional tags as unique, non-empty strings.
 *
 * @param value - Unknown tags value.
 * @param source - Content source used in diagnostics.
 * @returns The normalized tags, or `undefined` when omitted.
 * @throws Error when tags are malformed or duplicated.
 */
function tags(value: unknown, source: string): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) fail(source, "tags", "must be an array of strings");

  const normalized = value.map((tag) => text(tag, source, "tags"));
  if (new Set(normalized).size !== normalized.length) {
    fail(source, "tags", "must not contain duplicates");
  }

  return normalized;
}

/**
 * Validates shared and kind-specific metadata for local MDX content.
 *
 * @param value - Unknown metadata exported by an MDX module.
 * @param source - Content source used in diagnostics.
 * @returns The validated article or project metadata.
 * @throws Error when fields are missing, unsupported, or malformed.
 */
export function validateContentMetadata(
  value: unknown,
  source: string,
): ContentMetadata {
  const input = record(value, source);
  const kind = input.kind;

  if (kind !== "article" && kind !== "project") {
    fail(source, "kind", 'must be "article" or "project"');
  }

  const allowedFields =
    kind === "article" ? new Set([...commonFields, "published"]) : commonFields;
  for (const field of Object.keys(input)) {
    if (!allowedFields.has(field)) fail(source, field, "is not supported");
  }

  const updated = optionalDate(input.updated, source, "updated");
  const contentTags = tags(input.tags, source);
  const common = {
    title: text(input.title, source, "title"),
    description: text(input.description, source, "description"),
    ...(updated === undefined ? {} : { updated }),
    ...(contentTags === undefined ? {} : { tags: contentTags }),
  };

  if (kind === "article") {
    return {
      ...common,
      kind: "article",
      published: date(input.published, source, "published"),
    } satisfies ArticleMetadata;
  }

  return { ...common, kind: "project" } satisfies ProjectMetadata;
}
