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

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("core portfolio content and listing links remain usable", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("main")).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Hi, I’m Nikita Reshetnik." }),
    ).toBeVisible();
    await expect(page.getByText("Senior AI Engineer", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Résumé" })).toHaveAttribute(
      "href",
      "/nikita-reshetnik-cv.pdf",
    );
    for (const heading of ["Experience", "Selected work", "Writing"]) {
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    }
    const code = page.locator("#code");
    await expect(code.getByText("Open-source work includes")).toBeVisible();
    await expect(code.getByRole("link", { name: "github.com/grafanaKibana" })).toBeVisible();
    await expect(code.locator("figure")).toHaveCount(0);

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
