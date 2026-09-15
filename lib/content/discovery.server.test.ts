import assert from "node:assert/strict"
import fs from "node:fs"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { syncBuiltinESMExports } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { discoverMdxSlugs } from "./discovery"

/**
 * Marks synthetic directory entries as files.
 *
 * @returns Always `true` for the MDX fixtures.
 */
function fixtureFile(): boolean {
  return true
}

test("MDX discovery is deterministic and ignores unrelated files", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "portfolio-content-"))
  t.after(() => rm(directory, { force: true, recursive: true }))

  await Promise.all([
    writeFile(join(directory, "second.mdx"), "# Second\n"),
    writeFile(join(directory, "first.mdx"), "# First\n"),
    writeFile(join(directory, "notes.txt"), "ignored\n"),
  ])

  assert.deepEqual(discoverMdxSlugs(directory, "test content"), ["first", "second"])
})

test("MDX discovery reports both source paths for case-insensitive duplicate slugs", (t) => {
  const originalReaddirSync = fs.readdirSync
  fs.readdirSync = (() => [
    { name: "alpha.mdx", isFile: fixtureFile },
    { name: "Alpha.mdx", isFile: fixtureFile },
  ]) as unknown as typeof fs.readdirSync
  syncBuiltinESMExports()
  t.after(() => {
    fs.readdirSync = originalReaddirSync
    syncBuiltinESMExports()
  })

  assert.throws(
    () => discoverMdxSlugs("/synthetic/content", "fixture articles"),
    /fixture articles: duplicate slugs in \/synthetic\/content\/alpha\.mdx and \/synthetic\/content\/Alpha\.mdx/,
  )
})
