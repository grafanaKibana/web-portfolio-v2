import { expect, test } from "@playwright/test";

for (const width of [195, 390, 1024]) {
  test(`Home project and writing rows share their editorial layout at ${String(width)}px`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");

    const project = page.locator('[data-slot="home-project"] [data-slot="home-editorial-row"]').first();
    const article = page.locator('[data-slot="home-article"] [data-slot="home-editorial-row"]').first();
    const selectors = ["h3", "p", '[data-slot="project-actions"]'] as const;

    await expect(project).toHaveCSS("display", width >= 1024 ? "grid" : "block");
    await expect(article).toHaveCSS("display", width >= 1024 ? "grid" : "block");
    expect(await page.locator("#writing").evaluate((section) => section.scrollWidth <= section.clientWidth)).toBe(true);

    for (const selector of selectors) {
      const projectStyles = await project.locator(selector).first().evaluate((element) => {
        const styles = getComputedStyle(element);
        return [styles.fontSize, styles.lineHeight, styles.marginTop];
      });
      const articleStyles = await article.locator(selector).first().evaluate((element) => {
        const styles = getComputedStyle(element);
        return [styles.fontSize, styles.lineHeight, styles.marginTop];
      });

      expect(articleStyles).toEqual(projectStyles);
    }
  });
}

test("Home writing metadata omits reading time", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#writing");

  const metadata = page.locator('[data-slot="home-article"] [data-slot="row-metadata"]');
  expect(await metadata.first().textContent()).toBe(await metadata.first().locator("time").textContent());
  await expect(page.locator("#writing")).not.toContainText("min read");
});

test("Home project and article rows promote and follow their Read links", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 900 });

  for (const rowCase of [
    { slot: "home-project", href: "/projects/devbook" },
    { slot: "home-article", href: "/articles/building-an-llm-evaluation-harness" },
  ]) {
    await page.goto("/");
    const row = page.locator(`[data-slot="${rowCase.slot}"]`).first();
    const readLink = row.locator("a[data-row-link]");
    const restingColor = await readLink.evaluate((link) => getComputedStyle(link).color);

    await row.hover({ position: { x: 4, y: 4 } });
    await expect.poll(() => readLink.evaluate((link) => getComputedStyle(link).color))
      .not.toBe(restingColor);

    const box = await row.boundingBox();
    if (!box) throw new Error("Home editorial row must be measurable");
    await row.click({ position: { x: 4, y: box.height - 4 } });
    await expect(page).toHaveURL(new RegExp(`${rowCase.href}$`));
  }
});

test("Home project links keep independent hover and navigation", async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await context.route("https://devbook.zip/", (route) => route.fulfill({ body: "DevBook" }));
  await page.goto("/#projects");

  const row = page.locator('[data-slot="home-project"]').first();
  const readLink = row.locator("a[data-row-link]");
  const externalLink = row.getByRole("link", { name: "Live" });
  const restingReadColor = await readLink.evaluate((link) => getComputedStyle(link).color);
  const restingExternalColor = await externalLink.evaluate((link) => getComputedStyle(link).color);

  await externalLink.hover();
  await expect(readLink).toHaveCSS("color", restingReadColor);
  await expect.poll(() => externalLink.evaluate((link) => getComputedStyle(link).color))
    .not.toBe(restingExternalColor);

  const popupPromise = page.waitForEvent("popup");
  await externalLink.click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  await expect(popup).toHaveURL("https://devbook.zip/");
  await expect(page).toHaveURL(/\/#projects$/);
  await popup.close();
});

test("Home row selection and missing Read links do not navigate", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/#projects");

  const row = page.locator('[data-slot="home-project"]').first();
  const description = row.locator("article > p");
  await description.scrollIntoViewIfNeeded();
  await description.hover();
  const textLine = await description.evaluate((element) => {
    const text = element.firstChild;
    if (!text) return null;
    const range = document.createRange();
    range.selectNodeContents(text);
    const rect = range.getClientRects()[0];
    return rect ? { left: rect.left, right: rect.right, y: rect.top + rect.height / 2 } : null;
  });
  if (!textLine) throw new Error("Home project description text must be measurable");
  await page.mouse.move(textLine.left + 2, textLine.y);
  await page.mouse.down();
  await page.mouse.move(
    Math.min(textLine.right - 2, textLine.left + 240),
    textLine.y,
    { steps: 12 },
  );
  await page.mouse.up();
  expect(await page.evaluate(() => window.getSelection()?.toString().trim().length ?? 0)).toBeGreaterThan(0);
  await expect(page).toHaveURL(/\/#projects$/);

  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await row.locator("a[data-row-link]").evaluate((link) => {
    link.addEventListener("click", (event) => {
      if (!(event instanceof MouseEvent)) return;
      document.body.dataset.rowLinkControlKey = String(event.ctrlKey);
      event.preventDefault();
    }, { once: true });
  });
  await row.dispatchEvent("click", { ctrlKey: true });
  await expect(page.locator("body")).toHaveAttribute("data-row-link-control-key", "true");
  await expect(page).toHaveURL(/\/#projects$/);

  await row.locator("a[data-row-link]").evaluate((link) => {
    link.remove();
  });
  const box = await row.boundingBox();
  if (!box) throw new Error("Home editorial row must be measurable");
  await row.click({ position: { x: 4, y: box.height - 4 } });
  await expect(page).toHaveURL(/\/#projects$/);
});

test.describe("Home editorial rows without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("keep native Read links visible and usable", async ({ page }) => {
    await page.goto("/");
    const projectLink = page.locator('[data-slot="home-project"] a[data-row-link]').first();
    const articleLink = page.locator('[data-slot="home-article"] a[data-row-link]').first();

    await expect(projectLink).toBeVisible();
    await expect(articleLink).toBeVisible();
    await expect(articleLink).toHaveAttribute("href", "/articles/building-an-llm-evaluation-harness");
    await projectLink.click();
    await expect(page).toHaveURL(/\/projects\/devbook$/);
  });
});
