import assert from "node:assert/strict";
import test from "node:test";
import { resolveHeroContrast } from "./hero-contrast";

/** Independently measures WCAG contrast for a rendered, veil-composited sample.
 * @param sample - Background RGB channels in the range 0 to 255.
 * @param foreground - Six-digit foreground hex color.
 * @param veil - Black or white overlay hex color.
 * @param alpha - Overlay opacity in the unit interval.
 * @returns WCAG contrast ratio against the composited background.
 */
function contrast(sample: number[], foreground: string, veil: string, alpha: number): number {
  const rgb = sample.map((value) => value * (1 - alpha) + (veil === "#ffffff" ? 255 : 0) * alpha);
  const backgroundLuminance = rgb.reduce((sum, value, index) => {
    const channel = value / 255;
    return sum + ([0.2126, 0.7152, 0.0722][index] ?? 0) * (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  }, 0);
  const foregroundLuminance = [1, 3, 5].reduce((sum, offset, index) => {
    const channel = Number.parseInt(foreground.slice(offset, offset + 2), 16) / 255;
    return sum + ([0.2126, 0.7152, 0.0722][index] ?? 0) * (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  }, 0);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

test("light and dark palettes select opposite foregrounds without a veil", () => {
  const light = resolveHeroContrast(["#ffffff", "#dddddd"]);
  const dark = resolveHeroContrast(["#111111", "#333333"]);
  assert.deepEqual(
    [light.foreground, light.contentForeground, light.mutedForeground],
    ["#000000", "#080808", "#141414"],
  );
  assert.deepEqual(
    [dark.foreground, dark.contentForeground, dark.mutedForeground],
    ["#ffffff", "#f7f7f7", "#ebebeb"],
  );
  for (const colors of [["#ffffff", "#dddddd"], ["#111111", "#333333"]]) {
    assert.equal(resolveHeroContrast(colors).veilOpacity, 0);
  }
});

test("mixed and saturated palettes keep all interpolated samples above AA", () => {
  for (const colors of [["#000000", "#ffffff"], ["#ff0000", "#00ff00", "#0000ff"], ["#888888", "#777777"]]) {
    const resolved = resolveHeroContrast(colors);
    const rgb = colors.map((hex) => [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)));
    for (let segment = 0; segment < rgb.length - 1; segment += 1) {
      for (let step = 0; step <= 100; step += 1) {
        const sample = (rgb[segment] ?? []).map((channel, index) => channel * (1 - step / 100) + (rgb[segment + 1]?.[index] ?? 0) * step / 100);
        for (const foreground of [resolved.foreground, resolved.contentForeground, resolved.mutedForeground]) {
          assert.ok(contrast(sample, foreground, resolved.surface, resolved.veilOpacity) >= 4.5);
        }
      }
    }
  }
});

test("invalid palettes fail before rendering misleading contrast", () => {
  for (const colors of [[], ["#ffffff"], ["red", "blue"], ["#fff", "#000"], ["#gggggg", "#ffffff"]]) {
    assert.throws(() => resolveHeroContrast(colors));
  }
});

test("noise extremes preserve AA contrast across light and dark channels", () => {
  for (const noise of [5, 50, 100]) {
    for (const colors of [["#888888", "#777777"], ["#225544", "#99bbcc"]]) {
      const resolved = resolveHeroContrast(colors, noise);
      for (const color of colors) {
        const sample = [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16));
        for (const grain of [0, 255]) {
          const noisy = sample.map((channel) => {
            const overlay = channel < 127.5 ? 2 * channel * grain / 255 : 255 - 2 * (255 - channel) * (255 - grain) / 255;
            return channel + (overlay - channel) * noise / 200;
          });
          for (const foreground of [resolved.foreground, resolved.contentForeground, resolved.mutedForeground]) {
            assert.ok(contrast(noisy, foreground, resolved.surface, resolved.veilOpacity) >= 4.5);
          }
        }
      }
    }
  }
  for (const noise of [-1, 101, Number.NaN, Infinity]) {
    assert.throws(() => resolveHeroContrast(["#ffffff", "#000000"], noise));
  }
});
