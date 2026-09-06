import { expect, test } from "@playwright/test";

for (const colorScheme of ["light", "dark"] as const) {
  test(`theme follows the system by default from ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/");
    await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${colorScheme}\\b`));
    expect(await page.evaluate(() => localStorage.getItem("theme"))).toBeNull();

    const opposite = colorScheme === "dark" ? "light" : "dark";
    await page.emulateMedia({ colorScheme: opposite });
    await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${opposite}\\b`));

    await expect(page.locator('[data-slot="theme-toggle"] svg.lucide-sun-moon')).toBeVisible();
    await page.getByRole("button", { name: "Switch to light theme" }).click();
    await expect(page.locator('[data-slot="theme-toggle"] svg.lucide-sun')).toBeVisible();
    if (colorScheme === "dark") {
      await page.getByRole("button", { name: "Switch to dark theme" }).click();
    }
    await page.emulateMedia({ colorScheme });
    await page.emulateMedia({ colorScheme: opposite });
    await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${colorScheme}\\b`));
    await page.reload();
    await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${colorScheme}\\b`));

    if (colorScheme === "light") {
      await page.getByRole("button", { name: "Switch to dark theme" }).click();
    }
    await expect(page.locator('[data-slot="theme-toggle"] svg.lucide-moon')).toBeVisible();
    await page.getByRole("button", { name: "Switch to system theme" }).focus();
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("system");
    await page.reload();
    await expect(page.locator('[data-slot="theme-toggle"] svg.lucide-sun-moon')).toBeVisible();
    await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${opposite}\\b`));
    await page.emulateMedia({ colorScheme });
    await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${colorScheme}\\b`));
  });
}

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
  await expect(page.getByRole("button", { name: "Switch to system theme" })).toBeEnabled();
  expect(hydrationErrors).toEqual([]);
});
