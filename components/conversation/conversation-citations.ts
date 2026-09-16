import type { AskSource } from "@/lib/ask.contract";

const citationHrefPrefix = "#conversation-citation-";
const skippedNodeTypes = new Set([
  "code",
  "definition",
  "html",
  "image",
  "imageReference",
  "inlineCode",
  "toml",
  "yaml",
]);

interface MarkdownNode {
  children?: MarkdownNode[];
  type: string;
  url?: string;
  value?: string;
}

interface MarkdownParent extends MarkdownNode {
  children: MarkdownNode[];
}

type MarkdownTransformer = (tree: MarkdownNode) => void;

/** Terminal citation metadata passed through Streamdown's serialized plugin options. */
export interface ConversationCitationOptions {
  sources: readonly AskSource[];
}

/** A validated source and its one-based citation index. */
export interface ConversationCitation {
  index: number;
  source: AskSource;
}

/**
 * Neutralizes authored links and links valid text markers to terminal sources.
 *
 * @param options - Ordered terminal sources for one answer render.
 * @returns A Markdown transformer scoped to those sources.
 */
export function conversationCitationPlugin(options: ConversationCitationOptions): MarkdownTransformer {
  return (tree) => {
    transformChildren(tree, options.sources);
  };
}

/**
 * Resolves a transform-owned citation href to a safe local source.
 *
 * @param href - Rendered anchor href.
 * @param sources - Ordered terminal sources for the answer.
 * @returns Citation metadata, or undefined for authored, invalid, or unsafe links.
 */
export function resolveConversationCitation(
  href: string | undefined,
  sources: readonly AskSource[],
): ConversationCitation | undefined {
  if (!href?.startsWith(citationHrefPrefix)) return undefined;
  const value = href.slice(citationHrefPrefix.length);
  if (!/^[1-9]\d*$/u.test(value)) return undefined;
  const index = Number(value);
  const source = sources[index - 1];
  if (!source || !isSafeLocalHref(source.href)) return undefined;
  return { index, source };
}

/**
 * Rewrites eligible child nodes without traversing excluded Markdown or authored link descendants.
 *
 * @param node - Current Markdown node.
 * @param sources - Ordered terminal source metadata.
 */
function transformChildren(node: MarkdownNode, sources: readonly AskSource[]): void {
  if (!isParent(node) || skippedNodeTypes.has(node.type)) return;
  const children: MarkdownNode[] = [];
  for (const child of node.children) {
    if (child.type === "link" || child.type === "linkReference") {
      children.push({ type: "text", value: textContent(child) });
      continue;
    }
    if (child.type === "text" && typeof child.value === "string") {
      children.push(...splitCitationText(child.value, sources));
      continue;
    }
    transformChildren(child, sources);
    children.push(child);
  }
  node.children = children;
}

/**
 * Splits valid citation markers into transform-owned links and preserves every other token as text.
 *
 * @param value - Markdown text node value.
 * @param sources - Ordered terminal source metadata.
 * @returns Replacement Markdown nodes.
 */
function splitCitationText(value: string, sources: readonly AskSource[]): MarkdownNode[] {
  const nodes: MarkdownNode[] = [];
  let cursor = 0;
  for (const match of value.matchAll(/\[([1-9]\d*)\]/gu)) {
    const start = match.index;
    const marker = match[0];
    const index = Number(match[1]);
    if (start > cursor) nodes.push({ type: "text", value: value.slice(cursor, start) });
    if (Number.isSafeInteger(index) && sources[index - 1]) {
      nodes.push({
        type: "link",
        url: `${citationHrefPrefix}${String(index)}`,
        children: [{ type: "text", value: marker }],
      });
    } else {
      nodes.push({ type: "text", value: marker });
    }
    cursor = start + marker.length;
  }
  if (cursor < value.length) nodes.push({ type: "text", value: value.slice(cursor) });
  return nodes.length ? nodes : [{ type: "text", value }];
}

/**
 * Collects visible text while discarding authored link semantics.
 *
 * @param node - Authored link or link-reference node.
 * @returns Plain child text that cannot become a generated citation in this pass.
 */
function textContent(node: MarkdownNode): string {
  if (typeof node.value === "string") return node.value;
  return node.children?.map(textContent).join("") ?? "";
}

/**
 * Narrows a Markdown node to a mutable parent.
 *
 * @param node - Candidate Markdown node.
 * @returns Whether the node owns a children array.
 */
function isParent(node: MarkdownNode): node is MarkdownParent {
  return Array.isArray(node.children);
}

/**
 * Accepts only same-site paths for final application-owned citation targets.
 *
 * @param href - Source href validated at the rendering boundary.
 * @returns Whether the href is a local path and not a protocol-relative URL.
 */
function isSafeLocalHref(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//") && !href.includes("\\");
}
