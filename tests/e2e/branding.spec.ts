import { expect, test } from "@playwright/test";

test("the brand mark identifies Home navigation and remains decorative", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("portfolio-opening-splash-seen", "true");
  });

  await page.goto("/");
  for (const path of ["/", "/projects"]) {
    await page.goto(path);
    const homeLink = page.locator('[data-slot="site-header"] a').filter({
      has: page.locator('[data-slot="brand-mark"]'),
    });
    const mark = homeLink.locator('[data-slot="brand-mark"]');
    await expect(homeLink).toHaveAttribute("href", "/#top");
    await expect(mark).toBeVisible();
    await expect(mark).toHaveAttribute("aria-hidden", "true");

    const box = await mark.boundingBox();
    if (!box) throw new Error("Header brand mark must be measurable");
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
  }

  await page.goto("/?debugSplash");
  const splash = page.locator('[data-slot="opening-splash"]');
  await expect(splash).toHaveAttribute("aria-hidden", "true");
  await expect(splash.locator('[data-slot="brand-mark"]')).toBeVisible();
});

test("document brand icons are declared and loadable", async ({ page, request }) => {
  await page.goto("/");
  const icons = page.locator('link[rel="icon"], link[rel="apple-touch-icon"]');
  expect(await icons.count()).toBeGreaterThan(0);

  const hrefs = await icons.evaluateAll((elements) => elements
    .map((element) => element.getAttribute("href"))
    .filter((value): value is string => Boolean(value)));
  for (const href of hrefs) {
    const response = await request.get(href);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toMatch(/^image\//);
    expect((await response.body()).byteLength).toBeGreaterThan(0);
  }
});
