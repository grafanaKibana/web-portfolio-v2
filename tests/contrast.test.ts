import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8")
const mdxComponents = readFileSync(new URL("../mdx-components.tsx", import.meta.url), "utf8")
const codeActivityCss = readFileSync(
  new URL("../app/(home)/_components/home-code-activity/home-code-activity.module.scss", import.meta.url),
  "utf8",
)

/**
 * Reads one OKLCH token from a theme selector.
 *
 * @param selector - Theme selector containing the token.
 * @param name - CSS custom-property name without its prefix.
 * @returns The numeric OKLCH channels.
 * @throws AssertionError when the requested token is missing.
 */
function token(selector: string, name: string): [number, number, number] {
  const section = css.match(new RegExp(`${selector.replace(".", "\\.")} \\{([\\s\\S]*?)\\n\\}`))?.[1]
  const value = section?.match(new RegExp(`--${name}: oklch\\(([^)]+)\\)`))?.[1]
  assert.ok(value, `Missing --${name} in ${selector}`)
  const channels = value.split(/\s+/).map(Number)
  assert.equal(channels.length, 3, `Expected three OKLCH channels for --${name} in ${selector}`)
  assert.ok(channels.every(Number.isFinite), `Expected numeric OKLCH channels for --${name} in ${selector}`)
  return channels as [number, number, number]
}

/**
 * Reads the source hexadecimal color from a direct or foreground-mixed token.
 *
 * @param selector - Theme selector containing the token.
 * @param name - CSS custom-property name without its prefix.
 * @returns The normalized hexadecimal color.
 */
function hexToken(selector: string, name: string) {
  const section = css.match(new RegExp(`${selector.replace(".", "\\.")} \\{([\\s\\S]*?)\\n\\}`))?.[1]
  const value = section?.match(new RegExp(`--${name}: (?:color-mix\\(in oklab, )?(#[0-9a-fA-F]{6})`))?.[1]
  assert.ok(value, `Missing hexadecimal --${name} in ${selector}`)
  return value.toLowerCase()
}

/**
 * Converts a six-digit sRGB hexadecimal color to relative luminance.
 *
 * @param value - Hexadecimal color.
 * @returns The relative luminance.
 */
function hexLuminance(value: string) {
  assert.match(value, /^#[0-9a-f]{6}$/i, "Expected a six-digit hexadecimal color")
  const channels = value.match(/[0-9a-f]{2}/gi)?.map((channel) => Number.parseInt(channel, 16) / 255)
  assert.equal(channels?.length, 3)
  const [red = 0, green = 0, blue = 0] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

/**
 * Calculates contrast between a hexadecimal text token and an OKLCH background token.
 *
 * @param foreground - Hexadecimal foreground color.
 * @param background - Background OKLCH channels.
 * @returns The contrast ratio.
 */
function hexContrast(foreground: string, background: [number, number, number]) {
  const foregroundLuminance = hexLuminance(foreground)
  const backgroundLuminance = luminance(background)
  const lighter = Math.max(foregroundLuminance, backgroundLuminance)
  const darker = Math.min(foregroundLuminance, backgroundLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Converts an OKLCH token to relative sRGB luminance.
 *
 * @param oklch - Lightness, chroma, and hue channels.
 * @returns The relative luminance.
 */
function luminance(oklch: [number, number, number]) {
  const [lightness, chroma, hue] = oklch
  const radians = hue * Math.PI / 180
  const a = chroma * Math.cos(radians)
  const b = chroma * Math.sin(radians)
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
  /**
   * Constrains a linear color channel to the displayable range.
   *
   * @param value - Linear color channel.
   * @returns The channel constrained from zero to one.
   */
  const clamp = (value: number) => Math.max(0, Math.min(1, value))

  return 0.2126 * clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)
    + 0.7152 * clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)
    + 0.0722 * clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
}

/**
 * Calculates the WCAG contrast ratio between two color tokens.
 *
 * @param foreground - Foreground OKLCH channels.
 * @param background - Background OKLCH channels.
 * @returns The contrast ratio.
 */
function contrast(foreground: [number, number, number], background: [number, number, number]) {
  const foregroundLuminance = luminance(foreground)
  const backgroundLuminance = luminance(background)
  const lighter = Math.max(foregroundLuminance, backgroundLuminance)
  const darker = Math.min(foregroundLuminance, backgroundLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

test("text and primary button colors meet WCAG AA contrast", () => {
  for (const selector of [":root", ".dark"] as const) {
    const background = token(selector, "background")
    assert.ok(hexContrast(hexToken(selector, "foreground"), background) >= 7)
    assert.ok(hexContrast(hexToken(selector, "content-foreground"), background) >= 7)
    assert.ok(hexContrast(hexToken(selector, "muted-foreground"), background) >= 4.5)
  }
  assert.ok(contrast(token(".dark", "primary-foreground"), token(".dark", "primary")) >= 4.5)
})

test("hex color checks retain a known contrast baseline and reject invalid input", () => {
  assert.equal(hexContrast("#000000", [1, 0, 0]), 21)
  assert.throws(() => hexLuminance("not-a-color"), /six-digit hexadecimal/)
  assert.throws(() => hexToken(":root", "missing-token"), /Missing hexadecimal/)
})

test("brand accents use the approved foreground mix in every theme declaration", () => {
  const declarations = css.match(/--brand-accent(?:-start|-end)?: color-mix\(in oklab, #[0-9a-f]{6} 80%, var\(--foreground\)\);/gi)
  assert.equal(declarations?.length, 9)
})

test("shared MDX prose links own the content-to-foreground interaction contract", () => {
  assert.match(
    mdxComponents,
    /className="[^"]*text-content-foreground[^"]*hover:text-foreground[^"]*focus-visible:text-foreground[^"]*"/,
  )
  assert.match(mdxComponents, /underline underline-offset-4/)
})

test("app accents and field focus share the brand accent while field surfaces stay neutral", () => {
  assert.equal([...css.matchAll(/--ring: var\(--brand-accent\);/g)].length, 3)
  assert.deepEqual(token(":root", "input"), [0.93, 0.007, 106.5])
  assert.equal([...css.matchAll(/--input: oklch\(1 0 0 \/ 15%\);/g)].length, 2)
  assert.doesNotMatch(css, /--input:[^;]*var\(--brand-accent\)/)
  assert.doesNotMatch(css, /accent-em/)
  assert.doesNotMatch(css, /primary-text/)
  assert.match(css, /::selection\s*\{[\s\S]*background:\s*color-mix\([^;]*var\(--brand-accent\)/)
})

test("pull-request line counts use the approved semantic tokens at text contrast", () => {
  assert.deepEqual(token(":root", "destructive"), [0.577, 0.245, 27.325])
  assert.deepEqual(token(".dark", "destructive"), [0.704, 0.191, 22.216])
  assert.match(codeActivityCss, /\.additions\s*\{\s*color:\s*var\(--success\);\s*\}/)
  assert.match(codeActivityCss, /\.deletions\s*\{\s*color:\s*var\(--destructive\);\s*\}/)
  assert.doesNotMatch(codeActivityCss, /--(?:brand-accent|destructive)\s*:/)

  for (const selector of [":root", ".dark"] as const) {
    const background = token(selector, "background")
    assert.ok(hexContrast(hexToken(selector, "success"), background) >= 4.5)
    assert.ok(contrast(token(selector, "destructive"), background) >= 4.5)
  }
})

test("pull-request status icons retain distinct accessible theme colors", () => {
  assert.match(codeActivityCss, /\.statusIcon\s*\{[\s\S]*?color:\s*var\(--success\)/)
  assert.match(codeActivityCss, /\.statusIcon\[data-status="draft"\]\s*\{[\s\S]*?color:\s*var\(--muted-foreground\)/)
  assert.match(codeActivityCss, /:global\(\.dark\) \.statusIcon\[data-status="under-review"\]/)
  assert.match(codeActivityCss, /:global\(:root:not\(\.light, \.dark\)\) \.statusIcon\[data-status="under-review"\]/)

  const underReviewColors = [...codeActivityCss.matchAll(/color:\s*oklch\(([^)]+)\)/g)].map((match) => {
    const value = match[1]
    assert.ok(value)
    const channels = value.split(/\s+/).map(Number)
    assert.equal(channels.length, 3)
    assert.ok(channels.every(Number.isFinite))
    return channels as [number, number, number]
  })
  assert.deepEqual(underReviewColors, [[0.55, 0.14, 65], [0.78, 0.14, 75], [0.78, 0.14, 75]])
  const [lightUnderReview, darkUnderReview] = underReviewColors
  assert.ok(lightUnderReview && darkUnderReview)
  assert.ok(hexContrast(hexToken(":root", "success"), token(":root", "background")) >= 3)
  assert.ok(hexContrast(hexToken(".dark", "success"), token(".dark", "background")) >= 3)
  assert.ok(hexContrast(hexToken(":root", "muted-foreground"), token(":root", "background")) >= 3)
  assert.ok(hexContrast(hexToken(".dark", "muted-foreground"), token(".dark", "background")) >= 3)
  assert.ok(contrast(lightUnderReview, token(":root", "background")) >= 3)
  assert.ok(contrast(darkUnderReview, token(".dark", "background")) >= 3)
})

test("no-JavaScript system dark tokens stay aligned with the explicit dark theme", () => {
  const explicitDark = css.match(/\.dark \{([\s\S]*?)\n\}/)?.[1]
  const systemDark = css.match(/:root:not\(\.light, \.dark\) \{([\s\S]*?)\n  \}/)?.[1]
  assert.ok(explicitDark)
  assert.ok(systemDark)
  const explicitTokens: Record<string, string> = {}
  const systemTokens: Record<string, string> = {}
  for (const match of explicitDark.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    const [, name, value] = match
    assert.ok(name && value)
    explicitTokens[name] = value
  }
  for (const match of systemDark.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    const [, name, value] = match
    assert.ok(name && value)
    systemTokens[name] = value
  }
  assert.deepEqual(systemTokens, explicitTokens)
})

test("light and dark neutral tokens match the supplied design system", () => {
  assert.deepEqual(token(":root", "background"), [1, 0, 0])
  assert.equal(hexToken(":root", "foreground"), "#111111")
  assert.equal(hexToken(":root", "content-foreground"), "#454545")
  assert.deepEqual(token(":root", "primary"), [0, 0, 0])
  assert.deepEqual(token(":root", "primary-foreground"), [0.985, 0, 0])
  assert.equal(hexToken(":root", "muted-foreground"), "#727272")
  assert.deepEqual(token(".dark", "background"), [0.145, 0, 0])
  assert.equal(hexToken(".dark", "foreground"), "#fafafa")
  assert.equal(hexToken(".dark", "content-foreground"), "#b8b8b8")
  assert.deepEqual(token(".dark", "primary"), [0.922, 0, 0])
  assert.deepEqual(token(".dark", "primary-foreground"), [0.205, 0, 0])
  assert.equal(hexToken(".dark", "muted-foreground"), "#939393")
  assert.match(css, /--color-content-foreground:\s*var\(--content-foreground\)/)
})
