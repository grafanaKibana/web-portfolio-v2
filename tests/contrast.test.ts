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
function token(selector: string, name: string) {
  const section = css.match(new RegExp(`${selector.replace(".", "\\.")} \\{([\\s\\S]*?)\\n\\}`))?.[1]
  const value = section?.match(new RegExp(`--${name}: oklch\\(([^)]+)\\)`))?.[1]
  assert.ok(value, `Missing --${name} in ${selector}`)
  return value.split(/\s+/).map(Number)
}

/**
 * Converts an OKLCH token to relative sRGB luminance.
 *
 * @param oklch - Lightness, chroma, and hue channels.
 * @returns The relative luminance.
 */
function luminance(oklch: number[]) {
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
function contrast(foreground: number[], background: number[]) {
  const values = [luminance(foreground), luminance(background)].sort((left, right) => right - left)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

test("text and primary button colors meet WCAG AA contrast", () => {
  assert.ok(contrast(token(":root", "muted-foreground"), token(":root", "background")) >= 4.5)
  assert.ok(contrast(token(".dark", "primary-text"), token(".dark", "background")) >= 4.5)
  assert.ok(contrast(token(".dark", "primary-foreground"), token(".dark", "primary")) >= 4.5)
})
