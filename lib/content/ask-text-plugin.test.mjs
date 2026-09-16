import assert from "node:assert/strict"
import test from "node:test"

import { evaluate } from "@mdx-js/mdx"
import * as runtime from "react/jsx-runtime"

import remarkAskText from "./ask-text-plugin.mjs"

/**
 * Evaluates synthetic MDX with the production Ask extraction plugin.
 *
 * @param source - Synthetic MDX source.
 * @param path - Source path used in diagnostics.
 * @returns Evaluated MDX exports.
 */
function evaluateMdx(source, path = "synthetic.mdx") {
  return evaluate(
    { value: source, path },
    { ...runtime, remarkPlugins: [remarkAskText] },
  )
}

test("extracts public prose, lists, code, image alt text, and captions", async () => {
  const evaluated = await evaluateMdx(`
export const metadata = { kind: "project", title: "Ignored metadata" }

# Public heading

Paragraph with **strong evidence** and \`inline code\`.

- First capability
- Second capability

\`\`\`csharp
List<Result<T>> values = [];
\`\`\`

![Architecture overview](/fixture.png)

<figure>
  <img src="/showcase.png" alt="Product showcase" width={1440} />
  <figcaption>Validated public caption.</figcaption>
</figure>

{/* Editorial comment excluded from Ask. */}
`)

  assert.equal(evaluated.askText, [
    "Public heading",
    "Paragraph with strong evidence and inline code.",
    "- First capability\n- Second capability",
    "List<Result<T>> values = [];",
    "Architecture overview",
    "Product showcase\n\nValidated public caption.",
  ].join("\n\n"))
})

test("rejects visible runtime MDX and unsupported components with source diagnostics", async () => {
  await assert.rejects(
    evaluateMdx("# Heading\n\nVisible {answer}", "dynamic-visible.mdx"),
    /dynamic-visible\.mdx.*visible dynamic MDX expressions/i,
  )
  await assert.rejects(
    evaluateMdx("# Heading\n\n<InteractiveResult />", "component-visible.mdx"),
    /component-visible\.mdx.*InteractiveResult/i,
  )
  await assert.rejects(
    evaluateMdx("# Heading\n\n<img alt={description} />", "dynamic-alt.mdx"),
    /dynamic-alt\.mdx.*dynamic alt attribute/i,
  )
})

test("rejects empty extraction and authored askText exports", async () => {
  await assert.rejects(
    evaluateMdx("export const metadata = { kind: \"project\" }", "empty.mdx"),
    /empty\.mdx.*Ask text is empty/i,
  )
  await assert.rejects(
    evaluateMdx("export const askText = \"manual\"\n\nVisible body", "reserved.mdx"),
    /reserved\.mdx.*reserved/i,
  )
})
