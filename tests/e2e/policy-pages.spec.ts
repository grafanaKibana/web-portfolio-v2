import { expect, test, type Page } from "@playwright/test";

/**
 * Discovers internal site-information destinations from rendered navigation.
 *
 * @param page - Browser page used to render the global footer.
 * @returns Unique internal destinations in navigation order.
 */
async function discoverPolicyPaths(page: Page) {
  await page.goto("/");
  return page.getByRole("contentinfo").getByRole("navigation", { name: "Site information" })
    .getByRole("link")
    .evaluateAll((links) => [...new Set(links
      .map((link) => link.getAttribute("href"))
      .filter((href): href is string => Boolean(href?.startsWith("/"))))]);
}

for (const { width, colorScheme } of [
  { width: 390, colorScheme: "light" },
  { width: 1440, colorScheme: "dark" },
] as const) {
  test(`site-information pages preserve semantic, readable layout at ${String(width)}px in ${colorScheme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    const paths = await discoverPolicyPaths(page);

    for (const path of paths) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      const article = page.locator("main#main > article");
      await expect(article).toBeVisible();
      await expect(article.getByRole("heading", { level: 1 })).toHaveCount(1);
      expect(await page.locator("html").evaluate((root) => root.scrollWidth <= root.clientWidth)).toBe(true);

      const headings = await article.locator("h1, h2, h3, h4, h5, h6").evaluateAll((elements) =>
        elements.map((element) => Number(element.tagName.slice(1))));
      expect(headings[0]).toBe(1);
      expect(headings.every((level, index) => index === 0 || level > 1)).toBe(true);
    }
  });
}

test("site-information navigation remains keyboard reachable", async ({ page, browserName }) => {
  await page.goto("/");
  const navigation = page.getByRole("contentinfo").getByRole("navigation", { name: "Site information" });
  const links = navigation.getByRole("link");
  test.skip(await links.count() === 0, "Site-information navigation has no links");

  expect(await links.evaluateAll((items) => items.every((item) => item.getBoundingClientRect().height >= 44))).toBe(true);
  const forward = browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab";
  for (let index = 0; index < 80; index += 1) {
    await page.keyboard.press(forward);
    if (await links.first().evaluate((link) => link === document.activeElement)) break;
  }
  await expect(links.first()).toBeFocused();
  await expect(links.first()).not.toHaveCSS("outline-style", "none");
});

test("plain-text agent guidance is served as non-HTML content", async ({ request }) => {
  const response = await request.get("/llms.txt");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/^text\/plain/);
  expect((await response.text()).trim().length).toBeGreaterThan(0);
});

test.describe("site-information pages without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("keep discovered page content and navigation readable", async ({ page }) => {
    const paths = await discoverPolicyPaths(page);
    test.skip(paths.length === 0, "Site-information navigation has no destinations");
    await page.goto(paths[0] ?? "/");

    await expect(page.locator("main#main")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Site information" })).toBeVisible();
    expect(await page.locator("html").evaluate((root) => root.scrollWidth <= root.clientWidth)).toBe(true);
  });
});
