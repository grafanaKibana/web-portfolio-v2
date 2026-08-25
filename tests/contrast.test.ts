import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8")

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
  assert.ok(contrast(token(":root", "muted-foreground"), token(":root", "background")) >= 4.5)
  assert.ok(contrast(token(".dark", "accent-em"), token(".dark", "background")) >= 4.5)
  assert.ok(contrast(token(".dark", "primary-foreground"), token(".dark", "primary")) >= 4.5)
})

test("semantic emerald and selection styles share the approved accent role", () => {
  assert.deepEqual(token(":root", "accent-em"), [0.52, 0.1, 163])
  assert.deepEqual(token(".dark", "accent-em"), [0.74, 0.11, 165])
  assert.doesNotMatch(css, /primary-text/)
  assert.match(css, /::selection\s*\{[\s\S]*background:\s*color-mix\([^;]*var\(--accent-em\)/)
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
  assert.deepEqual(token(":root", "foreground"), [0, 0, 0])
  assert.deepEqual(token(":root", "primary"), [0, 0, 0])
  assert.deepEqual(token(":root", "primary-foreground"), [0.985, 0, 0])
  assert.deepEqual(token(":root", "muted-foreground"), [0.556, 0, 0])
  assert.deepEqual(token(".dark", "background"), [0.145, 0, 0])
  assert.deepEqual(token(".dark", "foreground"), [0.985, 0, 0])
  assert.deepEqual(token(".dark", "primary"), [0.922, 0, 0])
  assert.deepEqual(token(".dark", "primary-foreground"), [0.205, 0, 0])
  assert.deepEqual(token(".dark", "muted-foreground"), [0.708, 0, 0])
})
