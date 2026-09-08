import { expect, test } from "@playwright/test";

test("the brand mark identifies Home controls and the opening splash", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("portfolio-opening-splash-seen", "true");
  });

  for (const route of [
    { href: "/#top", label: "Back to top", path: "/" },
    { href: "/", label: "Home", path: "/projects/devbook" },
  ]) {
    await page.goto(route.path);

    const homeLink = page.locator('[data-slot="site-header"]').getByRole("link", {
      name: route.label,
    });
    const mark = homeLink.locator('[data-slot="brand-mark"]');
    await expect(homeLink).toHaveAttribute("href", route.href);
    await expect(mark).toBeVisible();
    await expect(mark).toHaveAttribute("aria-hidden", "true");

    const box = await mark.boundingBox();
    if (!box) throw new Error("Header brand mark must be measurable");
    expect(box.width).toBe(16);
    expect(box.height).toBe(16);
    expect(await mark.evaluate((element) => getComputedStyle(element).color))
      .toBe(await page.locator("body").evaluate((element) => getComputedStyle(element).color));
  }

  await page.goto("/?debugSplash");
  const splash = page.locator('[data-slot="opening-splash"]');
  await expect(splash).toHaveAttribute("aria-hidden", "true");
  await expect(splash.locator('[data-slot="brand-mark"]')).toBeVisible();
  await expect(splash.getByText("Reshetnik", { exact: true })).toHaveCount(0);
});

test("the document metadata exposes each loadable brand icon", async ({ page, request }) => {
  await page.goto("/");

  await expect(page.locator('link[rel="icon"][href*="/favicon.ico"]')).toHaveCount(1);
  await expect(page.locator('link[rel="icon"][href*="/icon.svg"]')).toHaveCount(1);
  await expect(page.locator('link[rel="apple-touch-icon"][href*="/apple-icon.png"]')).toHaveCount(1);

  for (const asset of [
    { contentType: /^image\/x-icon/, path: "/favicon.ico" },
    { contentType: /^image\/svg\+xml/, path: "/icon.svg" },
    { contentType: /^image\/png/, path: "/apple-icon.png" },
  ]) {
    const response = await request.get(asset.path);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toMatch(asset.contentType);
    expect((await response.body()).byteLength).toBeGreaterThan(0);
  }
});
