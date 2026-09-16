import assert from "node:assert/strict";
import test from "node:test";
import remarkParse from "remark-parse";
import { unified } from "unified";

import type { AskSource } from "@/lib/ask.contract";

import { conversationCitationPlugin, resolveConversationCitation } from "./conversation-citations";

interface TestNode {
  children?: TestNode[];
  type: string;
  url?: string;
  value?: string;
}

const sources: AskSource[] = [
  { id: "project:alpha", title: "Alpha", href: "/projects/alpha" },
  { id: "article:beta", title: "Beta", href: "/articles/beta" },
];

/**
 * Runs the citation plugin directly against a synthetic Markdown tree.
 *
 * @param tree - Mutable test tree.
 * @param citationSources - Terminal sources supplied to the plugin.
 * @returns The transformed tree.
 */
function transform(tree: TestNode, citationSources: readonly AskSource[] = sources): TestNode {
  conversationCitationPlugin({ sources: citationSources })(tree);
  return tree;
}

/**
 * Parses Markdown with the renderer's installed parser before applying the citation transform.
 *
 * @param markdown - Authored Markdown source.
 * @param citationSources - Terminal sources supplied to the plugin.
 * @returns The transformed Markdown tree.
 */
function parseAndTransform(markdown: string, citationSources: readonly AskSource[] = sources): TestNode {
  const processor = unified()
    .use(remarkParse)
    .use(conversationCitationPlugin, { sources: citationSources });
  return processor.runSync(processor.parse(markdown));
}

/**
 * Collects every node of one type from a synthetic Markdown tree.
 *
 * @param node - Current tree node.
 * @param type - Node type to collect.
 * @returns Matching nodes in traversal order.
 */
function nodesOfType(node: TestNode, type: string): TestNode[] {
  return [
    ...(node.type === type ? [node] : []),
    ...(node.children?.flatMap((child) => nodesOfType(child, type)) ?? []),
  ];
}

test("citation plugin maps repeated and reordered text markers to transform-owned links", () => {
  const tree = transform({
    type: "root",
    children: [{ type: "paragraph", children: [{ type: "text", value: "Beta [2], Alpha [1], Beta again [2]." }] }],
  });
  assert.deepEqual(nodesOfType(tree, "link").map(({ url }) => url), [
    "#conversation-citation-2",
    "#conversation-citation-1",
    "#conversation-citation-2",
  ]);
  assert.deepEqual(resolveConversationCitation("#conversation-citation-2", sources), {
    index: 2,
    source: sources[1],
  });
});

test("citation plugin maps undefined adjacent numeric markers but neutralizes defined references", () => {
  const adjacent = parseAndTransform("Evidence [1][2] and [2][3].", [
    ...sources,
    { id: "article:gamma", title: "Gamma", href: "/articles/gamma" },
  ]);
  assert.deepEqual(nodesOfType(adjacent, "link").map(({ url }) => url), [
    "#conversation-citation-1",
    "#conversation-citation-2",
    "#conversation-citation-2",
    "#conversation-citation-3",
  ]);

  const definedReference = parseAndTransform("Authored [1][2].\n\n[2]: /projects/beta");
  assert.equal(nodesOfType(definedReference, "link").length, 0);
  assert.equal(nodesOfType(definedReference, "text").map(({ value }) => value).join(""), "Authored 1.");
  assert.equal(nodesOfType(definedReference, "definition").length, 1);
});

test("stable citation plugin reads sources from each processor option set", () => {
  const pendingTree = transform({
    type: "root",
    children: [{ type: "paragraph", children: [{ type: "text", value: "Pending [1]." }] }],
  }, []);
  const completeTree = transform({
    type: "root",
    children: [{ type: "paragraph", children: [{ type: "text", value: "Complete [1]." }] }],
  });
  assert.equal(nodesOfType(pendingTree, "link").length, 0);
  assert.deepEqual(nodesOfType(completeTree, "link").map(({ url }) => url), ["#conversation-citation-1"]);
});

test("citation plugin strips authored links and does not convert excluded descendants", () => {
  const tree = transform({
    type: "root",
    children: [{
      type: "paragraph",
      children: [
        { type: "link", url: "/projects/alpha", children: [{ type: "text", value: "Local [1]" }] },
        { type: "link", url: "javascript:alert(1)", children: [{ type: "text", value: "Malicious [2]" }] },
        { type: "linkReference", children: [{ type: "text", value: "Reference [1]" }] },
        { type: "inlineCode", value: "[1]" },
        { type: "html", value: "<a href='javascript:alert(1)'>[2]</a>" },
        { type: "image", url: "https://tracker.invalid/pixel.png", value: "[1]" },
        { type: "text", value: " Safe [1]" },
      ],
    }],
  });
  assert.deepEqual(nodesOfType(tree, "link").map(({ url }) => url), ["#conversation-citation-1"]);
  assert.deepEqual(nodesOfType(tree, "text").map(({ value }) => value), [
    "Local [1]",
    "Malicious [2]",
    "Reference [1]",
    " Safe ",
    "[1]",
  ]);
  assert.equal(nodesOfType(tree, "inlineCode")[0]?.value, "[1]");
  assert.equal(nodesOfType(tree, "html")[0]?.value, "<a href='javascript:alert(1)'>[2]</a>");
});

test("citation plugin leaves markers inert without matching terminal metadata", () => {
  const tree = transform({
    type: "root",
    children: [{ type: "paragraph", children: [{ type: "text", value: "Unknown [3] and missing [1]." }] }],
  }, []);
  assert.equal(nodesOfType(tree, "link").length, 0);
  assert.equal(nodesOfType(tree, "text")[0]?.value, "Unknown ");
  assert.equal(nodesOfType(tree, "text").map(({ value }) => value).join(""), "Unknown [3] and missing [1].");
});

test("citation resolver rejects authored hrefs, invalid indexes, and unsafe source targets", () => {
  assert.equal(resolveConversationCitation("/projects/alpha", sources), undefined);
  assert.equal(resolveConversationCitation("#conversation-citation-0", sources), undefined);
  assert.equal(resolveConversationCitation("#conversation-citation-3", sources), undefined);
  assert.equal(resolveConversationCitation("#conversation-citation-1", [
    { id: "unsafe", title: "Unsafe", href: "javascript:alert(1)" },
  ]), undefined);
});
