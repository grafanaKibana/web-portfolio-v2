import { expect, test, type Page } from "@playwright/test";

const variants = [
  "flow", "sky", "mesh", "still", "ios", "linear",
  "glow", "rings", "pixel", "radial", "conic", "mist",
] as const;

/** Opens the preview and waits for the global decorative startup to finish.
 * @param page - Browser page hosting the preview.
 */
async function openPreview(page: Page) {
  await page.goto("/gradient-preview");
  await expect(page.getByRole("heading", { name: "Gradient background lab" })).toBeVisible();
  await expect(page.locator('[data-slot="opening-splash"]')).toHaveCount(0);
}

/** Returns whether the page introduces document-level horizontal overflow.
 * @param page - Browser page to inspect.
 * @returns Whether the document exceeds its viewport width.
 */
async function hasHorizontalOverflow(page: Page) {
  return page.locator("html").evaluate((root) => root.scrollWidth > root.clientWidth);
}

test("@webkit all variants render locally and expose their metadata controls", async ({ page }) => {
  test.setTimeout(60_000);
  const externalRequests: string[] = [];
  const pageErrors: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!url.hostname.match(/^(127\.0\.0\.1|localhost)$/)) externalRequests.push(request.url());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await openPreview(page);

  const selector = page.getByLabel("Variant");
  await expect(selector.locator("option")).toHaveCount(12);
  for (const variant of variants) {
    await selector.selectOption(variant);
    const background = page.locator(`[data-gradient-background][data-gradient-variant="${variant}"]`);
    await expect(background).toBeVisible();
    await expect(background.locator("div").first()).toHaveCSS("background-image", /gradient/i);
    const renderer = background.locator("[data-feral-renderer]");
    await expect(renderer).toBeVisible();
    await expect(renderer).toHaveAttribute("data-feral-renderer", /^(canvas|css|mist)$/);
    const rendererKind = await renderer.getAttribute("data-feral-renderer");
    if (rendererKind === "canvas") {
      const canvas = renderer.locator("canvas").first();
      await expect(canvas).toBeVisible();
      const hasPaint = await canvas.evaluate((element) => {
        if (!(element instanceof HTMLCanvasElement)) return false;
        const context = element.getContext("2d");
        if (!context || element.width < 2 || element.height < 2) return false;
        const pixels = context.getImageData(0, 0, element.width, element.height).data;
        return pixels.some((channel, index) => index % 4 !== 3 && channel !== 0);
      });
      expect(hasPaint).toBe(true);
    } else {
      const hasRenderedContent = await renderer.locator("div").first().evaluate((element) => {
        const style = getComputedStyle(element);
        return style.backgroundImage !== "none" || element.querySelector("svg") !== null;
      });
      expect(hasRenderedContent).toBe(true);
    }
    const capture = await page.getByTestId("gradient-stage").screenshot({ animations: "disabled" });
    expect(capture.byteLength).toBeGreaterThan(1_000);
  }

  expect(externalRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("palette, texture, balance, and structured controls update one active renderer", async ({ page }) => {
  await openPreview(page);
  const stage = page.getByTestId("gradient-stage");
  const before = await stage.screenshot({ animations: "disabled" });

  const colorInput = page.locator("#gradient-color-0");
  await colorInput.fill("");
  await colorInput.pressSequentially("#000000");
  await expect(colorInput).toBeFocused();
  await expect(colorInput).toHaveValue("#000000");
  await page.getByLabel("Noise").fill("0");
  await page.getByLabel("Divider 1").fill("0.15");
  await expect(page.locator("[data-gradient-background]")).toHaveCount(1);
  const after = await stage.screenshot({ animations: "disabled" });
  expect(after.equals(before)).toBe(false);

  await page.getByLabel("Variant").selectOption("flow");
  await expect(page.getByRole("group", { name: "Composition" })).toBeVisible();
  const structured = page.getByLabel("Points");
  await expect(structured).toBeVisible();
  await structured.fill("not json");
  await expect(structured).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("group", { name: "Composition" }).getByRole("alert")).toBeVisible();
  await structured.fill("[[20,20],[80,20]]");
  await expect(structured).toHaveAttribute("aria-invalid", "true");
  await structured.fill("[[20,20],[80,20],[80,80],[20,80]]");
  await expect(structured).toHaveAttribute("aria-invalid", "false");
  await page.getByRole("button", { name: "Add color", exact: true }).click();
  await expect(page.locator("[data-feral-renderer]")).toBeVisible();
  await expect(structured).toHaveValue(/\[50,50\]/);
  await page.getByLabel("Variant").selectOption("rings");
  await expect(page.getByLabel("Origin horizontal")).toBeVisible();
  const ringsBefore = await stage.screenshot({ animations: "disabled" });
  await page.getByLabel("Origin horizontal").fill("0.75");
  await expect(page.getByLabel("Origin horizontal")).toHaveValue("0.75");
  const ringsAfter = await stage.screenshot({ animations: "disabled" });
  expect(ringsAfter.equals(ringsBefore)).toBe(false);
  await page.getByLabel("Variant").selectOption("pixel");
  await page.getByLabel(/^Style/).selectOption("orbs");
  await expect(page.getByLabel(/^Gap/)).toHaveValue("4");
  await expect(page.getByLabel(/^Roundness/)).toHaveValue("100");
  await expect(page.getByLabel(/^Glow/)).toHaveValue("45");
  await page.getByLabel(/^Style/).selectOption("glass");
  await expect(page.getByLabel(/^Fill/)).toHaveValue("50");
});

test("@webkit preview remains keyboard-usable and contained across themes and sizes", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await openPreview(page);
    for (const theme of ["light", "dark"] as const) {
      await page.getByLabel("Surface").selectOption(theme);
      await expect(page.locator("main#main")).toHaveAttribute("data-preview-theme", theme);
      await expect(page.locator("[data-feral-renderer]")).toBeVisible();
      expect(await hasHorizontalOverflow(page)).toBe(false);
      const background = page.locator("[data-gradient-background]");
      let frame = await background.screenshot({ animations: "disabled" });
      await expect.poll(async () => {
        const next = await background.screenshot({ animations: "disabled" });
        const stable = next.equals(frame);
        frame = next;
        return stable;
      }, { intervals: [200, 200] }).toBe(true);
      await page.screenshot({
        path: `.omx/evidence/gradient-preview/${testInfo.project.name}-${String(viewport.width)}-${theme}.png`,
        fullPage: true,
        animations: "disabled",
      });
      const variant = page.getByLabel("Variant");
      await variant.focus();
      await expect(variant).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await expect(page.locator("[data-gradient-background]")).toHaveCount(1);
    }
  }
});

test("@webkit reduced motion and pause produce stable frames while foreground remains interactive", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openPreview(page);
  const background = page.locator("[data-gradient-background]");
  await expect(background.locator("[data-feral-renderer] canvas")).toBeVisible();
  // Lazy loading and the source renderer's initial refinement must finish before measuring motion.
  let first = await background.screenshot({ animations: "disabled" });
  await expect.poll(async () => {
    const next = await background.screenshot({ animations: "disabled" });
    const unchanged = next.equals(first);
    first = next;
    return unchanged;
  }, { intervals: [200, 200, 200] }).toBe(true);
  await page.waitForTimeout(180);
  const second = await background.screenshot({ animations: "disabled" });
  expect(second.equals(first)).toBe(true);

  const foreground = page.getByRole("link", { name: "View usage" });
  await foreground.focus();
  await expect(foreground).toBeFocused();
  await expect(foreground).toHaveCSS("pointer-events", "auto");
});

test("invalid runtime configuration keeps a fallback, reports once, and recovers", async ({ page }) => {
  await openPreview(page);
  await page.goto("/gradient-preview/fixture");
  await page.getByRole("button", { name: "Toggle invalid config" }).click();
  await expect(page.getByTestId("fixture-state")).toContainText("errors:1");
  await expect(page.locator("[data-gradient-background]")).toBeVisible();
  await page.getByRole("button", { name: "Foreground action" }).click();
  await expect(page.getByTestId("fixture-state")).toContainText("foreground:1");
  await page.getByRole("button", { name: "Toggle invalid config" }).click();
  await expect(page.locator("[data-gradient-background] canvas")).toBeVisible();
});

test("server-rendered fallback remains visible without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/gradient-preview");
  const background = page.locator("[data-gradient-background]");
  await expect(background).toBeVisible();
  await expect(background.locator("div").first()).toHaveCSS("background-image", /gradient/i);
  await expect(page.getByRole("link", { name: "View usage" })).toBeVisible();
  await context.close();
});

test("clipboard failure preserves a selectable usage example", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        /** Simulates a browser permission rejection.
         * @returns A promise rejected with the clipboard permission error.
         */
        writeText: () => Promise.reject(new Error("Clipboard denied")),
      },
      configurable: true,
    });
  });
  await openPreview(page);
  await page.getByRole("button", { name: "Copy React usage" }).click();
  await expect(page.locator("#usage").getByRole("status")).toContainText("Copy unavailable");
  await expect(page.locator("#usage code")).toContainText("GradientBackground");
  expect(errors).toEqual([]);
});
