import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import ts from "typescript";

const sourceRoots = ["app", "components", "content", "lib", "scripts", "tests"];
const rootSources = ["mdx-components.tsx"];

/**
 * Recursively collects TypeScript and JavaScript source files.
 *
 * @param directory - Directory to scan.
 * @returns The discovered source-file paths.
 */
function collectSourceFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const source = join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(source);
    return /\.(?:mjs|ts|tsx)$/.test(entry.name) ? [source] : [];
  });
}

/**
 * Finds the syntax node that owns a declaration's leading documentation.
 *
 * @param node - Declaration being inspected.
 * @returns The node whose leading comments contain the declaration docs.
 */
function documentationOwner(node: ts.Node): ts.Node {
  return ts.isVariableDeclaration(node) ? node.parent.parent : node;
}

/**
 * Extracts and normalizes the first TSDoc block on a declaration.
 *
 * @param node - Declaration being inspected.
 * @param sourceFile - Parsed source file containing the declaration.
 * @returns The normalized documentation, or `undefined` when absent.
 */
function documentationText(node: ts.Node, sourceFile: ts.SourceFile): string | undefined {
  const source = sourceFile.getFullText();
  const ranges = ts.getLeadingCommentRanges(
    source,
    documentationOwner(node).getFullStart(),
  ) ?? [];
  const comment = ranges
    .map(({ pos, end }) => source.slice(pos, end))
    .find((value) => value.startsWith("/**"));

  return comment
    ?.replace(/^\/\*\*|\*\/$/g, "")
    .replace(/^\s*\*\s?/gm, "")
    .trim();
}

/**
 * Labels named function-like and class declarations for diagnostics.
 *
 * @param node - Syntax node being inspected.
 * @param sourceFile - Parsed source file containing the node.
 * @returns The declaration label, or `undefined` for ignored nodes.
 */
function declarationLabel(node: ts.Node, sourceFile: ts.SourceFile): string | undefined {
  if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) {
    return node.name?.text;
  }
  if (
    ts.isVariableDeclaration(node)
    && ts.isIdentifier(node.name)
    && node.initializer
    && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
  ) {
    return node.name.text;
  }
  if (
    ts.isPropertyAssignment(node)
    && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
  ) {
    return node.name.getText(sourceFile);
  }
  if (
    (ts.isMethodDeclaration(node)
      || ts.isGetAccessorDeclaration(node)
      || ts.isSetAccessorDeclaration(node))
  ) {
    return node.name.getText(sourceFile);
  }
  return undefined;
}

/**
 * Resolves the function-like declaration represented by a documented node.
 *
 * @param node - Named declaration being inspected.
 * @returns The function-like node, or `undefined` for classes.
 */
function functionLike(node: ts.Node): ts.FunctionLikeDeclaration | undefined {
  if (
    ts.isFunctionDeclaration(node)
    || ts.isMethodDeclaration(node)
    || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node)
  ) {
    return node;
  }
  if (
    ts.isVariableDeclaration(node)
    && node.initializer
    && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
  ) {
    return node.initializer;
  }
  if (
    ts.isPropertyAssignment(node)
    && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
  ) {
    return node.initializer;
  }
  return undefined;
}

/**
 * Collects identifiers introduced by a parameter binding pattern.
 *
 * @param name - Identifier or destructuring pattern to inspect.
 * @returns The bound parameter names.
 */
function bindingNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];

  return name.elements.flatMap((element) =>
    ts.isOmittedExpression(element) ? [] : bindingNames(element.name));
}

/**
 * Collects the parameter names that require documentation.
 *
 * @param node - Named declaration being inspected.
 * @returns The declared parameter names.
 */
function parameterNames(node: ts.Node): string[] {
  return functionLike(node)?.parameters.flatMap(({ name }) => bindingNames(name)) ?? [];
}

/**
 * Collects generic parameter names from a function or class.
 *
 * @param node - Named declaration being inspected.
 * @returns The declared generic parameter names.
 */
function typeParameterNames(node: ts.Node): string[] {
  const typeParameters = ts.isClassDeclaration(node)
    ? node.typeParameters
    : functionLike(node)?.typeParameters;
  return typeParameters?.map(({ name }) => name.text) ?? [];
}

/**
 * Detects a value-bearing return without entering nested functions.
 *
 * @param node - Syntax node to inspect.
 * @returns Whether the node contains a value-bearing return.
 */
function containsValueReturn(node: ts.Node): boolean {
  if (ts.isFunctionLike(node)) return false;
  if (ts.isReturnStatement(node) && node.expression) return true;

  let found = false;
  ts.forEachChild(node, (child) => {
    if (!found) found = containsValueReturn(child);
  });
  return found;
}

/**
 * Determines whether a function returns a documented value.
 *
 * @param node - Named declaration being inspected.
 * @returns Whether the declaration produces a return value.
 */
function returnsValue(node: ts.Node): boolean {
  const declaration = functionLike(node);
  if (!declaration?.body) return false;
  if (ts.isArrowFunction(declaration) && !ts.isBlock(declaration.body)) return true;
  return containsValueReturn(declaration.body);
}

/**
 * Reads well-formed named tags from normalized documentation.
 *
 * @param documentation - Normalized TSDoc text.
 * @param tag - Named tag to collect.
 * @returns The documented parameter names.
 */
function documentedNames(
  documentation: string,
  tag: "param" | "typeParam",
): string[] {
  const pattern = new RegExp(`^@${tag}\\s+(\\S+)\\s+-\\s+\\S.*$`, "gm");
  return [...documentation.matchAll(pattern)].flatMap((match) => {
    const name = match[1];
    return name === undefined ? [] : [name];
  });
}

/**
 * Reads every line for one block tag.
 *
 * @param documentation - Normalized TSDoc text.
 * @param tag - Block tag to collect.
 * @returns The matching tag lines.
 */
function tagLines(documentation: string, tag: string): string[] {
  return documentation.match(new RegExp(`^@${tag}\\b.*$`, "gm")) ?? [];
}

test("named functions and classes have concise TSDoc with accurate contract tags", () => {
  const files = [
    ...sourceRoots.flatMap(collectSourceFiles),
    ...rootSources.filter(existsSync),
  ].sort();
  const missing: string[] = [];
  const verbose: string[] = [];
  const invalid: string[] = [];

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const sourceFile = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    /**
     * Traverses one syntax tree and validates documented declarations.
     *
     * @param node - Syntax node to inspect.
     */
    const visit = (node: ts.Node) => {
      const label = declarationLabel(node, sourceFile);
      if (label) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        const documentation = documentationText(node, sourceFile);
        const location = `${file}:${String(line)} ${label}`;
        if (!documentation) missing.push(location);
        else {
          const [firstLine = ""] = documentation.split(/\n\s*@/, 1);
          const summary = firstLine.trim();
          if (summary.length > 160) verbose.push(location);

          if (/^@params\b/m.test(documentation)) {
            invalid.push(`${location}: use singular @param`);
          }

          const expectedParameters = parameterNames(node).sort();
          const documentedParameters = documentedNames(documentation, "param").sort();
          if (tagLines(documentation, "param").length !== documentedParameters.length) {
            invalid.push(`${location}: @param must use "@param name - description"`);
          } else if (JSON.stringify(documentedParameters) !== JSON.stringify(expectedParameters)) {
            invalid.push(`${location}: expected @param tags for ${expectedParameters.join(", ") || "none"}`);
          }

          const expectedTypeParameters = typeParameterNames(node).sort();
          const documentedTypeParameters = documentedNames(documentation, "typeParam").sort();
          if (tagLines(documentation, "typeParam").length !== documentedTypeParameters.length) {
            invalid.push(`${location}: @typeParam must use "@typeParam name - description"`);
          } else if (JSON.stringify(documentedTypeParameters) !== JSON.stringify(expectedTypeParameters)) {
            invalid.push(`${location}: expected @typeParam tags for ${expectedTypeParameters.join(", ") || "none"}`);
          }

          const returnTags = tagLines(documentation, "returns");
          if (returnsValue(node)) {
            const [returnTag] = returnTags;
            if (returnTags.length !== 1 || returnTag === undefined || !/^@returns\s+\S/.test(returnTag)) {
              invalid.push(`${location}: value-returning functions require one descriptive @returns tag`);
            }
          } else if (returnTags.length) {
            invalid.push(`${location}: void and never-returning functions must omit @returns`);
          }

          for (const tag of ["throws", "see"] as const) {
            if (tagLines(documentation, tag).some((value) => !new RegExp(`^@${tag}\\s+\\S`).test(value))) {
              invalid.push(`${location}: @${tag} requires a description`);
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  assert.deepEqual(missing, [], `Missing JSDoc:\n${missing.join("\n")}`);
  assert.deepEqual(verbose, [], `TSDoc summary exceeds 160 characters:\n${verbose.join("\n")}`);
  assert.deepEqual(invalid, [], `Invalid TSDoc tags:\n${invalid.join("\n")}`);
});
