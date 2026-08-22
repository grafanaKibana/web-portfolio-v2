import { expect, test } from "@playwright/test";

test("experience details use native disclosure semantics", async ({ page }) => {
  await page.goto("/#experience");

  const details = page.getByRole("heading", { name: "AI Engineer", exact: true })
    .locator("xpath=ancestor::li")
    .locator("details");
  await expect(details).toHaveAttribute("open", "");
  await details.locator("summary").click();
  await expect(details).not.toHaveAttribute("open", "");
});

test("contact form uses native validation and constructs a mailto action", async ({ page }) => {
  await page.goto("/#contact");

  const name = page.getByLabel("Name");
  const email = page.getByLabel("Email");
  const message = page.getByLabel("Message");
  const form = page.locator("#contact form");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(name).toBeFocused();

  await name.fill("Ada Lovelace");
  await email.fill("not-an-email");
  await message.fill("Hello from the portfolio.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(email).toBeFocused();

  await email.fill("ada@example.com");
  expect(await form.evaluate((element) => (element as HTMLFormElement).checkValidity())).toBe(true);
  await expect(form).toHaveAttribute(
    "action",
    /mailto:reshetnik\.nikita@gmail\.com\?subject=Portfolio%20message%20from%20Ada%20Lovelace&body=From%3A%20Ada%20Lovelace%20%3Cada%40example\.com%3E%0A%0AHello%20from%20the%20portfolio\./,
  );
});

test("desktop navigation keeps primary links inline", async ({ page }) => {
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "Primary navigation" });

  await expect(navigation.getByRole("link", { name: "Projects" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Articles" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open navigation" })).toBeHidden();
});

test.describe("mobile navigation", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("traps focus, closes with Escape, and restores trigger focus", async ({ page }) => {
    await page.goto("/");
    const trigger = page.getByRole("button", { name: "Open navigation" });
    await trigger.click();

    const popup = page.getByRole("dialog");
    const close = page.getByRole("button", { name: "Close navigation" });
    await expect(popup).toBeVisible();
    await expect(close).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(popup.getByRole("link", { name: "Articles" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(popup).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveCSS("outline-width", "2px");
  });
});

test("splash fails open when a readiness dependency fails", async ({ page }) => {
  await page.addInitScript(() => {
    const querySelector = Document.prototype.querySelector;
    Document.prototype.querySelector = function <ElementType extends Element = Element>(selector: string) {
      if (selector === "#intro-heading") return null;
      return querySelector.call(this, selector) as ElementType | null;
    };
  });

  await page.goto("/");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByText("Nikita Reshetnik", { exact: true })).toHaveCount(1);
});

test("reduced motion keeps the descriptor static and disables splash animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { ready: new Promise(() => {}) },
    });
  });

  await page.goto("/");
  const descriptor = page.locator(".hero-descriptor");
  await expect(descriptor).toHaveText("AI Engineer");
  await page.waitForTimeout(2_200);
  await expect(descriptor).toHaveText("AI Engineer");

  const splash = page.locator("[aria-hidden=true]").filter({ hasText: "Nikita Reshetnik" });
  await expect(splash).toBeVisible();
  await expect(splash).toHaveCSS("pointer-events", "none");
  await expect(splash.locator("span")).toHaveCSS("animation-name", "none");
  await expect(page.getByRole("main")).toBeVisible();
});

test("descriptor rotation stops within five seconds", async ({ page }) => {
  await page.clock.install();
  await page.goto("/");
  const descriptor = page.locator(".hero-descriptor");

  await page.clock.runFor(4_100);
  await expect(descriptor).toHaveText("UI Design Enthusiast");
  await page.clock.runFor(4_000);
  await expect(descriptor).toHaveText("UI Design Enthusiast");
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("contact fallback and open disclosure remain usable without client islands", async ({ page }) => {
    await page.goto("/");
    const code = page.locator("#code");
    await expect(code.getByText("Open-source work includes")).toBeVisible();
    await expect(code.getByRole("link", { name: "github.com/grafanaKibana" })).toBeVisible();
    await expect(code.locator("figure")).toHaveCount(0);
    for (const label of [
      "Azure AI Fundamentals — Microsoft, August 2025",
      "GitHub Copilot — GitHub, June 2025",
    ]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: label, exact: true })).toHaveCount(0);
    }
    await expect(page.locator("[aria-hidden=true]").filter({ hasText: "Nikita Reshetnik" })).toHaveCount(0);
    await expect(
      page.locator("#contact form").getByRole("link", { name: "reshetnik.nikita@gmail.com" }),
    ).toHaveAttribute("href", "mailto:reshetnik.nikita@gmail.com");
    const summary = page.locator("#experience summary");
    await expect(page.locator("#experience details[open]")).toHaveCount(1);
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#experience details[open]")).toHaveCount(0);
    await page.keyboard.press("Space");
    await expect(page.locator("#experience details[open]")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Change color theme" })).toBeDisabled();
  });
});
