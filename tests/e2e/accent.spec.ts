import { expect, test } from "@playwright/test";

const brandSources = {
  dark: ["#4fdf8a", "#2ad2a1", "#34c7bd"],
  light: ["#0fb25e", "#04ac84", "#0aaeb4"],
} as const;

for (const theme of ["light", "dark"] as const) {
  test(`brand accents keep readable ${theme} surface and text treatments`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme === "light" ? "dark" : "light", reducedMotion: "reduce" });
    await page.addInitScript((preferredTheme) => {
      localStorage.setItem("theme", preferredTheme);
      sessionStorage.setItem("portfolio-opening-splash-seen", "true");
    }, theme);
    await page.goto("/#experience");
    const launcher = page.locator("button[data-launcher]");
    await expect(launcher).toBeVisible();

    const actual = await page.evaluate(({ sources, themeName }) => {
      const names = ["--brand-accent-start", "--brand-accent", "--brand-accent-end"];
      const expected = sources.map((source) => {
        const sample = document.createElement("span");
        sample.style.color = themeName === "light"
          ? source
          : `color-mix(in oklab, ${source} 80%, var(--foreground))`;
        document.body.append(sample);
        const color = getComputedStyle(sample).color;
        sample.remove();
        return color;
      });
      const background = getComputedStyle(document.body).backgroundColor;
      const resolved = names.map((name) => {
        const sample = document.createElement("span");
        sample.style.color = `var(${name})`;
        document.body.append(sample);
        const color = getComputedStyle(sample).color;
        sample.remove();
        return color;
      });
      const textColors = names.map((name) => {
        const sample = document.createElement("span");
        sample.style.color = themeName === "light"
          ? `color-mix(in oklab, var(${name}) 75%, var(--foreground))`
          : `var(${name})`;
        document.body.append(sample);
        const color = getComputedStyle(sample).color;
        sample.remove();
        return color;
      });
      const launcherElement = document.querySelector("button[data-launcher]");
      if (!launcherElement) throw new Error("Conversation launcher must exist before sampling its accent ink.");
      const launcherInk = getComputedStyle(launcherElement).color;
      const gradientSample = document.createElement("span");
      gradientSample.style.backgroundImage = "var(--brand-accent-text-gradient)";
      document.body.append(gradientSample);
      const textGradient = getComputedStyle(gradientSample).backgroundImage;
      gradientSample.remove();
      /** Measures contrast for browser-resolved colors against one background.
       * @param colors - Foreground colors to measure.
       * @param against - Shared background color.
       * @returns Contrast ratio for each foreground color.
       */
      const contrast = (colors: string[], against: string) => colors.map((color) => {
        const luminances = [color, against].map((cssColor) => {
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
        expected,
        launcherContrast: contrast(textColors, launcherInk),
        resolved,
        surfaceContrast: contrast(resolved, background),
        textContrast: contrast(textColors, background),
        textGradient,
      };
    }, { sources: brandSources[theme], themeName: theme });

    expect(actual.resolved).toEqual(actual.expected);
    await expect(launcher.locator("[data-entry-stroke]")).toHaveCSS("background-image", actual.textGradient);
    expect(Math.min(...actual.launcherContrast)).toBeGreaterThanOrEqual(4.5);
    expect(actual.textContrast.every((ratio) => ratio >= 4.5)).toBe(true);
    if (theme === "dark") expect(actual.surfaceContrast.every((ratio) => ratio >= 4.5)).toBe(true);
    const descriptor = page.locator('[data-slot="hero-descriptor"]');
    await expect(page.locator('[data-slot="hero-descriptor-glow"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="timeline-icon-glow"]')).toHaveCount(0);
    await expect(descriptor).toHaveCSS("filter", "none");
    await expect(descriptor).toHaveCSS("text-shadow", "none");
    await expect(descriptor).toHaveCSS("background-image", actual.textGradient);
  });
}

test("system and no-script rendering use the same theme-specific accent treatment", async ({ page, browser }) => {
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
      await expect(fallback.locator('[data-slot="hero-descriptor"]')).not.toBeEmpty();
      await expect(fallback.locator('[data-slot$="-glow"]')).toHaveCount(0);
    } finally {
      await fallback.close();
    }
  }
});
