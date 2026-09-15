import assert from "node:assert/strict"
import test from "node:test"

import { validateContentMetadata } from "./metadata"

test("valid article and project metadata is accepted", () => {
  const article = validateContentMetadata(
    {
      kind: "article",
      title: "Fixture article",
      description: "Synthetic article metadata.",
      published: "2026-08-21",
      tags: ["testing", "llm"],
    },
    "article fixture",
  )
  assert.equal(article.kind, "article")
  assert.equal(article.published, "2026-08-21")
  assert.deepEqual(article.tags, ["testing", "llm"])

  const project = validateContentMetadata(
    {
      kind: "project",
      title: "Fixture project",
      description: "Synthetic project metadata.",
      links: [{ label: "Source", href: "https://example.test/source" }],
    },
    "project fixture",
  )
  assert.equal(project.kind, "project")
  assert.deepEqual(project.links, [
    { label: "Source", href: "https://example.test/source" },
  ])
})

test("malformed required metadata fails with its source and field", () => {
  assert.throws(
    () => validateContentMetadata(
      { kind: "article", description: "Missing title", published: "2026-08-21" },
      "broken-article.mdx",
    ),
    /broken-article\.mdx.*title/i,
  )
  assert.throws(
    () => validateContentMetadata(
      { kind: "article", title: "Missing date", description: "No publication date" },
      "undated-article.mdx",
    ),
    /undated-article\.mdx.*published/i,
  )
  assert.throws(
    () => validateContentMetadata(
      { kind: "note", title: "Wrong kind", description: "Unsupported" },
      "wrong-kind.mdx",
    ),
    /wrong-kind\.mdx.*kind/i,
  )
  assert.throws(
    () => validateContentMetadata(
      { kind: "project", title: "Unverified image", description: "Unsupported", image: "/missing.png" },
      "image-project.mdx",
    ),
    /image-project\.mdx.*image.*not supported/i,
  )
  assert.throws(
    () => validateContentMetadata(
      {
        kind: "project",
        title: "Insecure link",
        description: "Unsupported protocol",
        links: [{ label: "Source", href: "http://example.com/project" }],
      },
      "insecure-project.mdx",
    ),
    /insecure-project\.mdx.*links\[0\]\.href.*https/i,
  )
})
