import { expect, test } from "@playwright/test";

const brandSources = {
  dark: ["#4fdf8a", "#2ad2a1", "#34c7bd"],
  light: ["#0a7a3d", "#007865", "#00756c"],
} as const;

for (const theme of ["light", "dark"] as const) {
  test(`brand accents always mix with foreground in ${theme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme === "light" ? "dark" : "light", reducedMotion: "reduce" });
    await page.addInitScript((preferredTheme) => {
      localStorage.setItem("theme", preferredTheme);
      sessionStorage.setItem("portfolio-opening-splash-seen", "true");
    }, theme);
    await page.goto("/#experience");

    const actual = await page.evaluate((sources) => {
      const names = ["--brand-accent-start", "--brand-accent", "--brand-accent-end"];
      const expected = sources.map((source) => {
        const sample = document.createElement("span");
        sample.style.color = `color-mix(in oklab, ${source} 80%, var(--foreground))`;
        document.body.append(sample);
        const color = getComputedStyle(sample).color;
        sample.remove();
        return color;
      });
      const rootStyle = getComputedStyle(document.documentElement);
      const background = getComputedStyle(document.body).backgroundColor;
      const resolved = names.map((name) => {
        const sample = document.createElement("span");
        sample.style.color = `var(${name})`;
        document.body.append(sample);
        const color = getComputedStyle(sample).color;
        sample.remove();
        return color;
      });
      const contrast = resolved.map((color) => {
        const luminances = [color, background].map((cssColor) => {
          const canvas = document.createElement("canvas");
          canvas.width = 1;
          canvas.height = 1;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (!context) throw new Error("Canvas color conversion must be available");
          context.fillStyle = cssColor;
          context.fillRect(0, 0, 1, 1);
          const channels = [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)].map((channel) => channel / 255);
          const [red = 0, green = 0, blue = 0] = channels.map((channel) =>
            channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
          return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
        });
        const [foregroundLuminance = 0, backgroundLuminance = 0] = luminances;
        return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
          / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
      });
      return {
        contrast,
        expected,
        foreground: rootStyle.getPropertyValue("--foreground").trim(),
        resolved,
      };
    }, brandSources[theme]);

    expect(actual.resolved).toEqual(actual.expected);
    expect(actual.contrast.every((ratio) => ratio >= 4.5)).toBe(true);
    const descriptor = page.locator('[data-slot="hero-descriptor"]');
    const currentDot = page.locator('[data-slot="timeline-dot"]').first();
    await expect(page.locator('[data-slot="hero-descriptor-glow"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="timeline-icon-glow"]')).toHaveCount(0);
    await expect(descriptor).toHaveCSS("filter", "none");
    await expect(descriptor).toHaveCSS("text-shadow", "none");
    await expect(currentDot.locator('[data-slot="timeline-icon"]')).toHaveCount(1);
    await expect(currentDot.locator('[data-slot="timeline-icon"]')).toHaveCSS("filter", "none");
    expect(await page.locator("#experience ol").evaluate((element) => getComputedStyle(element, "::after").content)).toBe("none");
  });
}

test("system and no-script rendering use the same foreground-mixed accent", async ({ page, browser }) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.setItem("theme", "system");
    sessionStorage.setItem("portfolio-opening-splash-seen", "true");
  });
  await page.goto("/");
  const descriptor = page.locator('[data-slot="hero-descriptor"]');
  const darkGradient = await descriptor.evaluate((element) => getComputedStyle(element).backgroundImage);
  await page.emulateMedia({ colorScheme: "light" });
  await expect(descriptor).not.toHaveCSS("background-image", darkGradient);
  await expect(page.locator('[data-slot$="-glow"]')).toHaveCount(0);

  for (const colorScheme of ["light", "dark"] as const) {
    const fallback = await browser.newPage({ colorScheme, javaScriptEnabled: false });
    try {
      await fallback.goto(new URL("/", page.url()).href);
      await expect(fallback.locator('[data-slot="hero-descriptor"]')).toHaveText("AI Engineer");
      await expect(fallback.locator('[data-slot$="-glow"]')).toHaveCount(0);
    } finally {
      await fallback.close();
    }
  }
});
