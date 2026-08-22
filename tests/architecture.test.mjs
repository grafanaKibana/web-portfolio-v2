import { existsSync, readFileSync, readdirSync } from "node:fs"
import { dirname, extname, join, relative, resolve, sep } from "node:path"

const root = process.cwd()
const ignored = new Set([
  ".git",
  ".next",
  ".omx",
  "design",
  "node_modules",
  "playwright-report",
  "public",
  "scripts",
  "test-results",
  "tests",
])
const extensions = new Set([".css", ".js", ".jsx", ".mdx", ".ts", ".tsx"])
const files = []

/**
 * Collects production source files while skipping generated and test directories.
 *
 * @param directory - Directory to scan recursively.
 */
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignored.has(entry.name)) continue

    const path = join(directory, entry.name)
    if (entry.isDirectory()) walk(path)
    else if (
      extensions.has(extname(entry.name)) &&
      (directory !== root || entry.name.startsWith("mdx-components."))
    ) files.push(path)
  }
}

walk(root)

const sources = new Map(files.map((file) => [file, readFileSync(file, "utf8")]))
const failures = []
const importPattern = /(?:import\s+(?:[^"']+?\s+from\s+)?|export\s+[^"']+?\s+from\s+|import\s*\()(["'])([^"']+)\1/g
const sourceExtensions = ["", ".ts", ".tsx", ".js", ".jsx", ".mdx"]
const longFormRoutes = ["articles", "projects"]
const allowedClientEntries = new Set([
  "app/_components/contact-form.tsx",
  "app/_components/descriptor-rotation.tsx",
  "app/theme.tsx",
  "components/mobile-navigation.tsx",
  "components/opening-splash.tsx",
])

/**
 * Converts an absolute source path to a portable repository-relative path.
 *
 * @param file - Absolute source path.
 * @returns The portable repository-relative path.
 */
function display(file) {
  return relative(root, file).split(sep).join("/")
}

/**
 * Extracts static and dynamic import specifiers from source text.
 *
 * @param source - JavaScript or TypeScript source text.
 * @returns The discovered import specifiers.
 */
function imports(source) {
  return [...source.matchAll(importPattern)].map((match) => match[2])
}

/**
 * Resolves a local import to a scanned source file when one exists.
 *
 * @param file - Source file containing the import.
 * @param specifier - Import specifier to resolve.
 * @returns The scanned dependency path, or `undefined` when unresolved.
 */
function resolveLocalImport(file, specifier) {
  const base = specifier.startsWith("@/")
    ? resolve(root, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(file), specifier)
      : undefined
  if (!base) return undefined
  for (const suffix of sourceExtensions) {
    const candidate = `${base}${suffix}`
    if (sources.has(candidate)) return candidate
  }
  for (const suffix of sourceExtensions.slice(1)) {
    const candidate = join(base, `index${suffix}`)
    if (sources.has(candidate)) return candidate
  }
}

for (const [file, source] of sources) {
  const path = display(file)
  const dependencies = imports(source)
  const usesNodeContentApis = dependencies.some((specifier) =>
    /^(?:node:)?(?:fs|fs\/promises|path)$/.test(specifier),
  )

  if (usesNodeContentApis && !dependencies.includes("server-only")) {
    failures.push(`${path}: Node content boundaries must import 'server-only'`)
  }

  if (/^app\/.+\/(?:layout|page)\.[jt]sx?$/.test(path) || /^app\/(?:layout|page)\.[jt]sx?$/.test(path)) {
    if (/^\s*(?:"use client"|'use client')/.test(source)) {
      failures.push(`${path}: route layouts and pages must remain Server Components`)
    }
  }

  if (/(^|\/)(?:adapter|domain|registr(?:y|ies)|repositor(?:y|ies)|service|use-cases?)(\/|$)/.test(path)) {
    failures.push(`${path}: unapproved architecture layer`)
  }

  if (/https?:\/\/[^\s"')]*(?:cdn\.|framerusercontent\.com)/i.test(source)) {
    failures.push(`${path}: prototype CDN dependency`)
  }
}

for (const family of longFormRoutes) {
  const page = join(root, "app", family, "[slug]", "page.tsx")
  const notFound = join(root, "app", family, "not-found.tsx")
  const source = sources.get(page)

  if (!source) {
    failures.push(`app/${family}/[slug]/page.tsx: missing long-form route entry`)
    continue
  }
  if (!/export const dynamicParams\s*=\s*false/.test(source)) {
    failures.push(`app/${family}/[slug]/page.tsx: dynamicParams must be false`)
  }
  if (!/export (?:async )?function generateStaticParams\s*\(/.test(source)) {
    failures.push(`app/${family}/[slug]/page.tsx: missing generated static parameters`)
  }
  if (!/export async function generateMetadata\s*\(/.test(source)) {
    failures.push(`app/${family}/[slug]/page.tsx: metadata must remain route-owned`)
  }
  if (!/\bnotFound\s*\(/.test(source)) {
    failures.push(`app/${family}/[slug]/page.tsx: unknown slugs must call notFound()`)
  }
  if (!sources.has(notFound)) {
    failures.push(`app/${family}/not-found.tsx: missing route-family not-found UI`)
  }

  const catchAll = [...sources.keys()]
    .map(display)
    .find((path) => new RegExp(`^app/${family}/\\[\\[?\\.\\.\\.[^\\]]+\\]\\]?/`).test(path))
  if (catchAll) {
    failures.push(`${catchAll}: catch-all routes are not allowed for static content families`)
  }
}

for (const [entry, source] of sources) {
  if (!/^\s*(?:"use client"|'use client')/.test(source)) continue

  if (!allowedClientEntries.has(display(entry))) {
    failures.push(`${display(entry)}: unapproved client boundary`)
  }

  const visited = new Set()
  const pending = [entry]
  while (pending.length) {
    const file = pending.pop()
    if (!file || visited.has(file)) continue
    visited.add(file)

    const dependencies = imports(sources.get(file) ?? "")
    if (dependencies.some((specifier) => specifier === "server-only" || /^(?:node:)?(?:fs|fs\/promises|path)$/.test(specifier))) {
      failures.push(`${display(entry)}: client graph reaches server-only module ${display(file)}`)
      break
    }

    for (const specifier of dependencies) {
      const dependency = resolveLocalImport(file, specifier)
      if (dependency) pending.push(dependency)
    }
  }
}

for (const name of ["next.config.js", "next.config.mjs", "next.config.ts"]) {
  const file = join(root, name)
  if (existsSync(file) && /cacheComponents\s*:\s*true/.test(readFileSync(file, "utf8"))) {
    failures.push(`${name}: Cache Components are outside the approved architecture`)
  }
}

if (failures.length) {
  console.error(failures.join("\n"))
  process.exitCode = 1
} else {
  console.log(`Architecture checks passed (${files.length} source files)`)
}
