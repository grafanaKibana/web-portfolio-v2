import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { loadActivitySnapshot } from "../content/activity"
import { discoverMdxSlugs } from "../content/discovery"
import { validateMdxModule } from "../content/load"
import { validateContentMetadata } from "../content/metadata"
import { validateSlug } from "../content/slugs"

test("valid article and project metadata is accepted", () => {
  const article = validateContentMetadata(
    {
      kind: "article",
      title: "Building an evaluation harness",
      description: "A repeatable way to evaluate model changes.",
      published: "2026-08-21",
      tags: ["testing", "llm"],
    },
    "article fixture",
  )
  assert.equal(article.kind, "article")
  assert.equal(article.published, "2026-08-21")
  assert.deepEqual(article.tags, ["testing", "llm"])

  assert.equal(
    validateContentMetadata(
      {
        kind: "project",
        title: "DevBook",
        description: "A source-controlled technical knowledge base.",
      },
      "project fixture",
    ).kind,
    "project",
  )
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
})

test("MDX modules require a component and valid metadata", () => {
  /**
   * Provides the minimal renderable component required by the MDX contract.
   *
   * @returns No rendered content.
   */
  const Content = () => null
  const loaded = validateMdxModule(
    {
      default: Content,
      metadata: {
        kind: "project",
        title: "DevBook",
        description: "A source-controlled technical knowledge base.",
      },
    },
    "devbook",
    "devbook.mdx",
  )

  assert.equal(loaded.slug, "devbook")
  assert.equal(loaded.Content, Content)
  assert.equal(loaded.metadata.kind, "project")
  assert.throws(() => validateMdxModule(null, "broken", "null.mdx"), /null\.mdx.*object/i)
  assert.throws(
    () => validateMdxModule({ metadata: loaded.metadata }, "broken", "componentless.mdx"),
    /componentless\.mdx.*default component/i,
  )
})

test("slugs reject traversal and non-normalized input", () => {
  assert.equal(validateSlug("safe-content-slug", "fixture"), "safe-content-slug")
  for (const slug of ["../secrets", "nested/path", "Uppercase", "has spaces"]) {
    assert.throws(() => validateSlug(slug, "fixture"), /fixture.*slug/i)
  }
})

test("MDX discovery is deterministic and ignores unrelated files", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "portfolio-content-"))
  t.after(() => rm(directory, { force: true, recursive: true }))

  await Promise.all([
    writeFile(join(directory, "second.mdx"), "# Second\n"),
    writeFile(join(directory, "first.mdx"), "# First\n"),
    writeFile(join(directory, "notes.txt"), "ignored\n"),
  ])

  assert.deepEqual(await discoverMdxSlugs(directory, "test content"), ["first", "second"])
})

test("representative repository content is discoverable", async () => {
  assert.deepEqual(
    await discoverMdxSlugs(join(process.cwd(), "content/articles"), "articles"),
    ["building-an-llm-evaluation-harness"],
  )
  assert.deepEqual(
    await discoverMdxSlugs(join(process.cwd(), "content/projects"), "projects"),
    ["devbook"],
  )
})

test("activity snapshot parser accepts valid data", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "portfolio-activity-"))
  t.after(() => rm(directory, { force: true, recursive: true }))
  const source = join(directory, "activity.json")
  const months = Array.from({ length: 12 }, (_, index) => ({
    period: `2026-${String(index + 1).padStart(2, "0")}`,
    value: index / 12,
  })).reverse()

  await writeFile(source, JSON.stringify({ months }))

  assert.deepEqual(await loadActivitySnapshot(source), {
    available: true,
    months: months.toSorted((left, right) => left.period.localeCompare(right.period)),
  })
})

test("activity snapshot parser fails open", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "portfolio-activity-"))
  t.after(() => rm(directory, { force: true, recursive: true }))
  const malformed = join(directory, "malformed.json")
  const invalid = join(directory, "invalid.json")
  const duplicate = join(directory, "duplicate.json")
  await Promise.all([
    writeFile(malformed, "{"),
    writeFile(invalid, JSON.stringify({
      months: Array.from({ length: 12 }, (_, index) => ({
        period: `2026-${String(index + 1).padStart(2, "0")}`,
        value: index === 0 ? 1.1 : 0.5,
      })),
    })),
    writeFile(duplicate, JSON.stringify({
      months: Array.from({ length: 12 }, () => ({ period: "2026-01", value: 0.5 })),
    })),
  ])

  const warnings: string[] = []
  const warn = console.warn
  console.warn = (message) => warnings.push(String(message))
  t.after(() => { console.warn = warn })

  for (const source of [join(directory, "missing.json"), directory, malformed, invalid, duplicate]) {
    assert.deepEqual(await loadActivitySnapshot(source), { available: false })
  }
  assert.equal(warnings.length, 5)
  assert.ok(warnings.every((warning) => warning.includes(directory)))
})

test("repository omits unverified activity data and preserves the approved resume", async (t) => {
  const warn = console.warn
  console.warn = () => undefined
  t.after(() => { console.warn = warn })
  assert.deepEqual(await loadActivitySnapshot(), { available: false })

  const resume = await readFile(join(process.cwd(), "public", "nikita-reshetnik-cv.pdf"))
  assert.equal(createHash("sha256").update(resume).digest("hex"), "fa18c4537b8cba15039c04cd6a1f00e666dfa8ac97f9f75188c4bfbf04a709bf")
})
