const blockContainerTypes = new Set(["blockquote", "listItem", "root"])
const inlineContainerTypes = new Set(["delete", "emphasis", "link", "strong"])
const supportedJsxNames = new Set([
  "blockquote",
  "br",
  "code",
  "em",
  "figcaption",
  "figure",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "strong",
  "ul",
])

/**
 * Builds a source-specific extraction error.
 *
 * @param file - MDX source being compiled.
 * @param message - Extraction failure description.
 * @returns Source-specific error.
 */
function extractionError(file, message) {
  return new Error(`${file.path || "MDX content"}: ${message}`)
}

/**
 * Reads a static string attribute from an MDX JSX node.
 *
 * @param node - MDX JSX node.
 * @param name - Attribute name.
 * @param file - MDX source being compiled.
 * @returns Attribute value, or an empty string when absent.
 */
function stringAttribute(node, name, file) {
  const attributes = Array.isArray(node.attributes) ? node.attributes : []
  const attribute = attributes.find((candidate) =>
    candidate && typeof candidate === "object" && candidate.type === "mdxJsxAttribute" && candidate.name === name)
  if (!attribute) return ""
  if (typeof attribute.value !== "string") {
    throw extractionError(file, `Ask text cannot include a dynamic ${name} attribute`)
  }
  return attribute.value
}

/**
 * Joins visible fragments without collapsing meaningful code or paragraph breaks.
 *
 * @param fragments - Extracted visible fragments.
 * @param separator - Separator used between non-empty fragments.
 * @returns Normalized text.
 */
function joinFragments(fragments, separator) {
  return fragments.map((fragment) => fragment.trim()).filter(Boolean).join(separator)
}

/**
 * Identifies an MDX expression containing only a source comment.
 *
 * @param node - MDX expression node.
 * @returns Whether the expression is comment-only.
 */
function isMdxComment(node) {
  return typeof node.value === "string" && /^\s*\/\*[\s\S]*\*\/\s*$/u.test(node.value)
}

/**
 * Extracts and concatenates inline children.
 *
 * @param node - Parent MDAST node.
 * @param file - MDX source being compiled.
 * @returns Visible inline text.
 */
function inlineChildren(node, file) {
  const children = Array.isArray(node.children) ? node.children : []
  return children.map((child) => inlineText(child, file)).join("")
}

/**
 * Extracts inline text while rejecting runtime-generated visible content.
 *
 * @param node - MDAST node.
 * @param file - MDX source being compiled.
 * @returns Visible inline text.
 */
function inlineText(node, file) {
  if (node.type === "text" || node.type === "inlineCode") {
    return typeof node.value === "string" ? node.value : ""
  }
  if (node.type === "break") return "\n"
  if (node.type === "image") return typeof node.alt === "string" ? node.alt : ""
  if (node.type === "mdxFlowExpression" || node.type === "mdxTextExpression") {
    if (isMdxComment(node)) return ""
    throw extractionError(file, "Ask text cannot include visible dynamic MDX expressions")
  }
  if (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") {
    const name = typeof node.name === "string" ? node.name : ""
    if (!supportedJsxNames.has(name)) {
      throw extractionError(file, `Ask text cannot safely extract <${name || "dynamic"}>`)
    }
    if (name === "img") return stringAttribute(node, "alt", file)
    if (name === "br") return "\n"
  } else if (!inlineContainerTypes.has(String(node.type))) {
    return ""
  }

  return inlineChildren(node, file)
}

/**
 * Extracts one visible block from an MDAST node.
 *
 * @param node - MDAST node.
 * @param file - MDX source being compiled.
 * @returns Visible block text.
 */
function blockText(node, file) {
  if (node.type === "mdxjsEsm" || node.type === "definition" || node.type === "thematicBreak") return ""
  if (node.type === "html") {
    const value = typeof node.value === "string" ? node.value.trim() : ""
    if (!/^<!--[\s\S]*-->$/u.test(value)) {
      throw extractionError(file, "Ask text cannot safely extract raw HTML")
    }
    return ""
  }
  if (node.type === "code") return typeof node.value === "string" ? node.value.trim() : ""
  if (node.type === "heading" || node.type === "paragraph") return inlineChildren(node, file).trim()
  if (node.type === "image") return typeof node.alt === "string" ? node.alt.trim() : ""
  if (node.type === "mdxFlowExpression" || node.type === "mdxTextExpression") {
    if (isMdxComment(node)) return ""
    throw extractionError(file, "Ask text cannot include visible dynamic MDX expressions")
  }
  if (node.type === "list") {
    const children = Array.isArray(node.children) ? node.children : []
    return joinFragments(children.map((child) => blockText(child, file)).map((text) =>
      text.split("\n").map((line, index) => `${index === 0 ? "- " : "  "}${line}`).join("\n")), "\n")
  }
  if (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") {
    const name = typeof node.name === "string" ? node.name : ""
    if (!supportedJsxNames.has(name)) {
      throw extractionError(file, `Ask text cannot safely extract <${name || "dynamic"}>`)
    }
    if (name === "img") return stringAttribute(node, "alt", file).trim()
    const children = Array.isArray(node.children) ? node.children : []
    return joinFragments(children.map((child) => blockText(child, file) || inlineText(child, file)), "\n\n")
  }
  if (blockContainerTypes.has(String(node.type))) {
    const children = Array.isArray(node.children) ? node.children : []
    return joinFragments(children.map((child) => blockText(child, file)), "\n\n")
  }
  return inlineText(node, file).trim()
}

/**
 * Creates the MDX module export carrying the extracted Ask text.
 *
 * @param askText - Extracted public content.
 * @returns MDX ESM node with its ESTree representation.
 */
function askTextExport(askText) {
  const declaration = {
    type: "VariableDeclaration",
    kind: "const",
    declarations: [{
      type: "VariableDeclarator",
      id: { type: "Identifier", name: "askText" },
      init: { type: "Literal", value: askText, raw: JSON.stringify(askText) },
    }],
  }
  return {
    type: "mdxjsEsm",
    value: `export const askText = ${JSON.stringify(askText)}`,
    data: {
      estree: {
        type: "Program",
        sourceType: "module",
        body: [{ type: "ExportNamedDeclaration", declaration, specifiers: [], source: null }],
      },
    },
  }
}

/**
 * Compiles repository-authored MDX into a validated plain-text export for Ask.
 *
 * @returns Remark transformer.
 */
export default function remarkAskText() {
  return (tree, file) => {
    const children = Array.isArray(tree.children) ? tree.children : []
    if (children.some((node) => node?.type === "mdxjsEsm" && /\bexport\s+(?:const|let|var)\s+askText\b/u.test(node.value))) {
      throw extractionError(file, "askText is reserved for the Ask extraction plugin")
    }
    const askText = joinFragments(children.map((child) => blockText(child, file)), "\n\n")
    if (!askText) throw extractionError(file, "Ask text is empty")
    children.push(askTextExport(askText))
  }
}
