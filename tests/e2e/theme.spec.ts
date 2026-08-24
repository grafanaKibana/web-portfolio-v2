import { expect, test } from "@playwright/test";

test("theme selection persists after reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Switch to (?:dark|light) theme/ }).click();

  const selectedTheme = await page.evaluate(() => localStorage.getItem("theme"));
  expect(selectedTheme).toMatch(/^(?:dark|light)$/);
  if (!selectedTheme) throw new Error("Theme selection must be persisted");
  await expect(page.locator("html")).toHaveClass(new RegExp(selectedTheme));

  await page.reload();
  await expect(page.locator("html")).toHaveClass(new RegExp(selectedTheme));
});

test("stored theme hydrates without a mismatch", async ({ page }) => {
  const hydrationErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /hydration|did not match|server rendered html/i.test(message.text())) {
      hydrationErrors.push(message.text());
    }
  });
  await page.addInitScript(() => {
    localStorage.setItem("theme", "dark");
  });

  await page.goto("/");

  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByRole("button", { name: "Switch to light theme" })).toBeEnabled();
  expect(hydrationErrors).toEqual([]);
});
