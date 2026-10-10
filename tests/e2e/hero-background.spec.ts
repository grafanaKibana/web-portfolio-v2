import { expect, test } from "@playwright/test";

test("hero compositor recovers its opaque native-density frame after theme, resize, and context changes", { tag: "@webkit" }, async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("portfolio-opening-splash-seen", "true");
    localStorage.setItem("theme", "dark");
  });
  await page.goto("/");
  const canvas = page.locator("canvas[data-opening-renderer]");
  await expect(canvas).toHaveAttribute("data-opening-renderer", "ready");
  await expect(canvas).toHaveCSS("opacity", "1");
  const firstPixel = await canvas.evaluate((element: HTMLCanvasElement) => {
    const gl = element.getContext("webgl");
    if (!gl) throw new Error("Expected supported compositor");
    const pixel = new Uint8Array(4);
    gl.readPixels(10, element.height - 10, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    return Array.from(pixel);
  });
  expect(firstPixel[3]).toBe(255);
  await page.evaluate(() => { document.documentElement.classList.remove("dark"); });
  await expect(canvas).toHaveAttribute("data-opening-renderer", "ready");
  await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) => {
    const gl = element.getContext("webgl");
    if (!gl) throw new Error("Expected supported compositor");
    const pixel = new Uint8Array(4);
    gl.readPixels(10, element.height - 10, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    return Array.from(pixel);
  })).not.toEqual(firstPixel);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) => {
    const rect = element.getBoundingClientRect();
    return [element.width, element.height].join() === [Math.round(rect.width * devicePixelRatio), Math.round(rect.height * devicePixelRatio)].join();
  })).toBe(true);
  await expect(canvas).toHaveAttribute("data-opening-renderer", "ready");
  const contextControl = await canvas.evaluateHandle((element: HTMLCanvasElement) => element.getContext("webgl")?.getExtension("WEBGL_lose_context"));
  await contextControl.evaluate((extension) => { extension?.loseContext(); });
  await expect(canvas).toHaveAttribute("data-opening-renderer", "fallback");
  await expect(canvas).toHaveCSS("opacity", "0");
  await expect(page.locator('[data-hero-background="light"]')).toBeVisible();
  await contextControl.evaluate((extension) => { extension?.restoreContext(); });
  await expect(canvas).toHaveAttribute("data-opening-renderer", "ready");
  await expect(canvas).toHaveCSS("opacity", "1");
  await contextControl.dispose();
});

for (const failure of ["unsupported", "compile", "limit"] as const) {
  test(`hero ${failure} failure exposes CSS and releases the opening splash`, { tag: "@webkit" }, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript((mode) => {
      localStorage.setItem("theme", "dark");
      if (mode === "unsupported") {
        const original = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "getContext");
        if (!original) throw new Error("Expected canvas context descriptor");
        Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
          ...original,
          /**
           * Simulates unavailable WebGL while retaining ordinary browser canvas behavior.
           * @param this - Canvas requesting its rendering context.
           * @param type - Requested rendering context.
           * @param args - Browser context options.
           * @returns The native context or the simulated unsupported result.
           */
          value: function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
            if (type === "webgl") return null;
            return Reflect.apply(original.value as (...args: unknown[]) => unknown, this, [type, ...args]);
          },
        });
      } else if (mode === "compile") {
        // eslint-disable-next-line @typescript-eslint/unbound-method -- Invoke the saved browser method with its original context.
        const original = WebGLRenderingContext.prototype.getShaderParameter;
        WebGLRenderingContext.prototype.getShaderParameter = function (shader, parameter) {
          return parameter === this.COMPILE_STATUS ? false : original.call(this, shader, parameter) as unknown;
        };
      } else {
        Object.defineProperty(window, "devicePixelRatio", { value: 8 });
      }
    }, failure);
    await page.goto("/");
    await expect(page.locator("canvas[data-opening-renderer]")).toHaveAttribute("data-opening-renderer", "fallback");
    await expect(page.locator("canvas[data-opening-renderer]")).toHaveCSS("opacity", "0");
    await expect(page.locator('[data-hero-background="dark"]')).toBeVisible();
    await expect(page.locator('[data-slot="opening-splash"]')).toHaveCount(0, { timeout: 6_000 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    if (failure !== "unsupported") {
      const context = await page.locator("canvas[data-opening-renderer]").evaluateHandle((element: HTMLCanvasElement) => element.getContext("webgl"));
      await page.getByRole("link", { name: "Privacy Policy", exact: true }).click();
      await expect(page.locator("canvas[data-opening-renderer]")).toHaveCount(0);
      await expect.poll(() => context.evaluate((gl) => gl?.isContextLost())).toBe(true);
      await context.dispose();
    }
  });
}

test("changing theme during a held image decode cannot reveal a stale frame", { tag: "@webkit" }, async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("portfolio-opening-splash-seen", "true");
    localStorage.setItem("theme", "dark");
  });
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(/hero-dark\.generated\.[^/]+\.webp/, async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-theme-root]")).toBeAttached();
    const canvas = page.locator("canvas[data-opening-renderer]");
    await expect(canvas).toHaveAttribute("data-opening-renderer", "pending");
    await page.evaluate(() => { document.documentElement.classList.remove("dark"); });
    await expect(canvas).toHaveAttribute("data-opening-renderer", "ready");
    const lightFrame = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
    release?.();
    await expect.poll(() => page.locator('link[data-opening-image="primary"]').evaluate(async (link: HTMLLinkElement) => {
      const image = new Image();
      image.src = link.href;
      await image.decode();
      return image.complete;
    })).toBe(true);
    expect(await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL())).toBe(lightFrame);
    await expect(canvas).toHaveAttribute("data-opening-renderer", "ready");
  } finally { release?.(); }
});

test("hero CSS remains visible without JavaScript", { tag: "@webkit" }, async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error("Browser tests require a configured base URL");
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.locator("canvas[data-opening-renderer]")).toHaveCSS("opacity", "0");
    await expect(page.locator("[data-hero-background]:visible")).toHaveCount(1);
    await expect(page.locator("[data-hero-background]:visible")).not.toHaveCSS("background-image", "none");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  } finally { await context.close(); }
});
