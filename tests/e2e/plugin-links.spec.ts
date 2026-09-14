import { expect, test } from "@playwright/test";

const pluginLinks = [
  { href: "https://obsidian.md/plugins?id=tabsdown", purpose: "Store page", label: /^(?:[\d,]+ Downloads|Store page)$/ },
  { href: "https://github.com/grafanaKibana/obsidian-tabsdown", purpose: "Obsidian source", label: /^(?:v?\d+\.\d+\.\d+(?:\+[\w.-]+)?|Obsidian source)$/ },
  { href: "https://github.com/grafanaKibana/quartz-tabsdown", purpose: "Quartz source", label: /^(?:v?\d+\.\d+\.\d+(?:\+[\w.-]+)?|Quartz source)$/ },
];

test("Home keeps original plugin labels while case studies resolve their data", async ({ page }) => {
  for (const path of ["/", "/projects/obsidian-tabsdown"]) {
    await page.goto(path);
    const region = path === "/"
      ? page.locator('[data-slot="home-project"]').filter({ has: page.getByRole("heading", { name: "Tabsdown", exact: true }) })
      : page.locator('[data-slot="project-hero"]');
    for (const { href, purpose, label } of pluginLinks) {
      const link = region.locator(`a[href="${href}"]`);
      await expect(link).toHaveCount(1);
      await expect(link).toHaveText(path === "/" ? purpose : label, { useInnerText: true });
      await expect(link).toHaveAccessibleName(new RegExp(purpose));
      await expect(link).toHaveAttribute("target", "_blank");
    }
  }
});

test("Colsdown uses its short name in the index and opened page", async ({ page }) => {
  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "Colsdown", exact: true })).toBeVisible();
  await page.goto("/projects/obsidian-colsdown");
  await expect(page.getByRole("heading", { level: 1, name: "Colsdown", exact: true })).toBeVisible();
  await expect(page).toHaveTitle("Colsdown | Nikita Reshetnik");
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`plugin links remain readable without JavaScript in ${colorScheme}`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ colorScheme, javaScriptEnabled: false });
    const page = await context.newPage();
    try {
      for (const width of [375, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const path of ["/", "/projects/obsidian-tabsdown", "/projects/obsidian-colsdown"]) {
          await page.goto(new URL(path, testInfo.project.use.baseURL).href);
          const plugin = path.endsWith("colsdown") ? "colsdown" : "tabsdown";
          const store = page.locator(`main a[href="https://obsidian.md/plugins?id=${plugin}"]`);
          await store.scrollIntoViewIfNeeded();
          await expect(store).toBeVisible();
          await expect(store).toHaveText(path === "/" ? "Store page" : /^(?:[\d,]+ Downloads|Store page)$/, { useInnerText: true });
          await expect(store.locator('[data-slot="obsidian-icon"]')).toHaveCount(1);
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        }
      }
    } finally {
      await context.close();
    }
  });
}
