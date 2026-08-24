import { expect, test } from "@playwright/test";

const knownRoutes = [
  {
    path: "/articles/building-an-llm-evaluation-harness",
    heading: "Building an LLM Evaluation Harness with Microsoft.Extensions.AI",
  },
  { path: "/projects/devbook", heading: "DevBook" },
];
const missingRouteFamilies = ["articles", "projects"];

for (const route of knownRoutes) {
  test(`${route.path} renders its static MDX route`, async ({ page }) => {
    const response = await page.goto(route.path);

    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
    await expect(page.locator("article")).toBeVisible();
  });
}

for (const family of missingRouteFamilies) {
  test(`unknown ${family} slug uses the static framework 404`, async ({ page }) => {
    const response = await page.goto(`/${family}/not-a-real-slug`);

    expect(response?.status()).toBe(404);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });
}

test("Home sections keep their semantic order", async ({ page }) => {
  await page.goto("/");

  expect(await page.locator("main#main > section").evaluateAll((sections) =>
    sections.map((section) => section.getAttribute("aria-labelledby") ?? section.id),
  )).toEqual(["intro-heading", "about-heading", "experience-heading"]);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the corrected intro, shell anchors, and long-form routes remain usable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Hi, I’m Nikita Reshetnik.Shipping Agents at scale.");
    await expect(page.getByText("Open to work", { exact: false })).toBeVisible();
    await expect(page.locator('[data-slot="hero-descriptor"]')).toHaveText("AI Engineer");
    await expect(page.getByRole("link", { name: "Download Résumé" })).toHaveAttribute(
      "href",
      "https://github.com/grafanaKibana/LatexCV/releases/latest/download/resume.pdf",
    );
    await expect(page.getByRole("contentinfo")).toContainText(
      `© ${String(new Date().getFullYear())} Nikita Reshetnik. All rights reserved. · Local Time:`,
    );
    await expect(page.getByRole("navigation", {
      name: "Compact navigation",
      includeHidden: true,
    })).toHaveCount(1);
    expect(await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link").evaluateAll((links) =>
      links.map((link) => link.getAttribute("href")),
    )).toEqual(["#top"]);
    await expect(page.locator("#about")).toHaveCount(1);
    await expect(page.locator("#experience")).toHaveCount(1);
    for (const id of ["education", "skills", "projects", "code", "writing", "contact"]) {
      await expect(page.locator(`#${id}`)).toHaveCount(0);
    }

    await page.goto("/articles");
    await page
      .getByRole("link", {
        name: "Building an LLM Evaluation Harness with Microsoft.Extensions.AI",
      })
      .click();
    await expect(page).toHaveURL(/\/articles\/building-an-llm-evaluation-harness$/);
    await expect(
      page.getByRole("heading", { level: 2, name: "The structure" }),
    ).toBeVisible();

    await page.goto("/projects");
    await page.getByRole("link", { name: "DevBook" }).click();
    await expect(page).toHaveURL(/\/projects\/devbook$/);
    await expect(
      page.getByRole("heading", { level: 2, name: "One source, different uses" }),
    ).toBeVisible();
  });
});
