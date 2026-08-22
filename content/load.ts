import type { LoadedContent, MdxModule } from "./types";
import { validateContentMetadata } from "./metadata";

/**
 * Validates an imported MDX module and narrows its content contract.
 *
 * @param value - Unknown module value returned by the dynamic import.
 * @param slug - Validated slug assigned to the content.
 * @param source - Source path used in validation diagnostics.
 * @returns The validated content module.
 * @throws Error when the module shape or metadata is invalid.
 */
export function validateMdxModule(
  value: unknown,
  slug: string,
  source: string,
): LoadedContent {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${source}: MDX module must be an object`);
  }

  const loadedModule = value as Partial<MdxModule>;
  if (typeof loadedModule.default !== "function") {
    throw new Error(`${source}: MDX module must export a default component`);
  }

  return {
    slug,
    metadata: validateContentMetadata(loadedModule.metadata, source),
    Content: loadedModule.default,
  };
}
