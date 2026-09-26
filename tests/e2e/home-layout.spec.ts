import { expect, test, type Locator, type Page } from "@playwright/test";
import { compile } from "sass";

const educationCss = compile(
  "app/(home)/_components/education/education.module.scss",
).css.replaceAll(/:global\(([^)]+)\)/g, "$1");

const educationWidths = [390, 768, 1024, 1279, 1280, 1440] as const;

/**
 * Reads a measurable element rectangle.
 *
 * @param element - Element whose bounds are required.
 * @returns The rendered rectangle.
 */
async function boxOf(element: Locator) {
  const box = await element.boundingBox();
  if (!box) throw new Error("Expected a measurable rendered element");
  return box;
}

/**
 * Creates deterministic credential rows for layout-only browser fixtures.
 *
 * @param count - Number of credential records to render.
 * @returns Credential list markup in source order.
 */
function credentialRows(count: number) {
  return Array.from({ length: count }, (_, index) => `
    <li class="min-w-0 border-b last:border-b-0" data-slot="credential-item">
      <a aria-label="Verify credential: Synthetic cloud developer associate certification ${String(index + 1)}" class="group flex min-h-16.5 w-full min-w-0 items-center gap-3 py-3 text-content-foreground no-underline transition-colors duration-150 ease-in-out hover:text-foreground focus-visible:rounded focus-visible:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none" href="https://example.com/credential/${String(index + 1)}">
        <span aria-hidden="true" class="grid size-10.5 shrink-0 place-items-center">
          ${index % 2 === 0
            ? '<span class="credentialIcon block size-9" data-slot="credential-icon" style="--credential-icon-url:url(\'/certifications/synthetic.svg\')"></span>'
            : '<img alt="" class="size-10.5 object-contain" data-slot="credential-badge" height="42" src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\'/%3E" width="42">'}
        </span>
        <span class="block min-w-0">
          <span class="block text-base leading-6 font-medium text-foreground wrap-anywhere" data-slot="credential-title">Synthetic cloud developer associate certification ${String(index + 1)}</span>
          <span class="mt-1.25 block font-mono text-xs leading-4.5 text-muted-foreground" data-slot="credential-date">Jan ${String(2020 + index)}</span>
        </span>
        <span aria-hidden="true" class="ml-auto grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground" data-slot="credential-link-cue">↗</span>
      </a>
    </li>
  `).join("");
}

/**
 * Mounts Education's production CSS around deterministic content records.
 *
 * @param page - Browser page receiving the fixture.
 * @param count - Number of credential records to render.
 */
async function mountEducation(page: Page, count: number) {
  const hasCredentials = count > 0;
  const singleColumn = count <= 2;
  if (await page.locator("html[data-education-fixture-styles]").count() === 0) {
    await page.goto("/");
    await page.addStyleTag({ content: educationCss });
    await page.locator("html").evaluate((root) => { root.dataset.educationFixtureStyles = "true"; });
  }
  await page.locator("body").evaluate((body, markup) => { body.innerHTML = markup; }, `
    <main>
      <section class="page-shell-gutter w-full scroll-mt-3 py-8 lg:-scroll-mt-5 lg:py-12 xl:-scroll-mt-1" id="education">
        <h2 class="m-0 mb-8 font-sans text-2xl leading-[1.12] font-semibold tracking-[-0.03em] text-balance wrap-anywhere text-foreground lg:mb-10">Education</h2>
        <div class="grid grid-cols-[minmax(0,1fr)] gap-8 lg:data-[has-credentials=true]:grid-cols-[minmax(0,1fr)_fit-content(55%)] lg:data-[has-credentials=true]:gap-x-12" data-has-credentials="${String(hasCredentials)}" data-slot="education-tracks">
          <div class="min-w-0" data-slot="education-academic">
            <h3 class="trackLabel">Academic</h3>
            <p class="m-0 text-base leading-6 font-medium text-foreground">Bachelor of Engineering in Software Engineering</p>
            <p class="m-0 mt-3 text-sm leading-[1.6] text-content-foreground">National Technical University of Ukraine</p>
            <p class="m-0 mt-4 font-mono text-xs leading-4.5 text-muted-foreground">September 2019 — June 2023</p>
          </div>
          ${hasCredentials ? `
            <div class="flex min-h-0 min-w-0 flex-col" data-slot="education-credentials">
              <h3 class="trackLabel mb-3">Professional credentials</h3>
              <div class="min-w-0 flex-none">
                <div class="credentialScrollport overflow-y-auto overscroll-y-auto focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring${count > 2 ? " h-54 md:h-44" : ""}" data-slot="credential-scrollport">
                  <ul class="m-0 grid list-none grid-cols-[minmax(0,1fr)] content-start p-0 md:data-[single-column=false]:grid-cols-2 md:data-[single-column=false]:gap-x-5" data-single-column="${String(singleColumn)}" data-slot="credential-list">
                    ${credentialRows(count)}
                  </ul>
                </div>
              </div>
            </div>
          ` : ""}
        </div>
      </section>
    </main>
  `);
}

/**
 * Replaces hydrated credential rows with deterministic overflow content.
 *
 * @param page - Hydrated Home page containing the production track.
 * @param count - Number of synthetic credentials to insert.
 */
async function replaceHydratedCredentials(page: Page, count: number) {
  const list = page.locator('[data-slot="credential-list"]');
  await list.evaluate((element, rowCount) => {
    const template = element.querySelector('[data-slot="credential-item"]');
    if (!template) throw new Error("Expected one server-rendered credential as the synthetic row template");
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < rowCount; index += 1) {
      const item = template.cloneNode(true) as HTMLElement;
      const link = item.querySelector("a");
      const title = item.querySelector('[data-slot="credential-title"]');
      const date = item.querySelector('[data-slot="credential-date"]');
      if (!link || !title || !date) throw new Error("Credential template is incomplete");
      link.setAttribute("href", `https://example.com/credential/${String(index + 1)}`);
      const syntheticTitle = `Synthetic cloud developer associate certification ${String(index + 1)}`;
      link.setAttribute("aria-label", `Verify credential: ${syntheticTitle}`);
      title.textContent = syntheticTitle;
      date.textContent = `Jan ${String(2020 + index)}`;
      fragment.append(item);
    }
    element.replaceChildren(fragment);
    element.dataset.singleColumn = "false";
  }, count);
}

test("desktop home content stays contained and ordered as text reflows", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");

  const sections = page.locator("main#main > section");
  expect(await sections.count()).toBeGreaterThan(1);
  const sectionBoxes = await Promise.all((await sections.all()).map(boxOf));
  for (const [index, box] of sectionBoxes.entries()) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(1280);
    const next = sectionBoxes[index + 1];
    if (next) expect(box.y + box.height).toBeLessThanOrEqual(next.y + 1);
  }

  const sample = sections.locator("p").first();
  if (await sample.count()) {
    await sample.evaluate((element) => {
      element.textContent = "Synthetic readable content ".repeat(40);
    });
  }

  expect(await page.locator("html").evaluate((root) => root.scrollWidth <= root.clientWidth)).toBe(true);
  const mainBox = await boxOf(page.locator("main#main"));
  for (const section of await sections.all()) {
    const box = await boxOf(section);
    expect(box.x).toBeGreaterThanOrEqual(mainBox.x - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(mainBox.x + mainBox.width + 1);
  }
});

test("Education switches tracks and credential columns at the approved breakpoints", async ({ page }) => {
  for (const width of educationWidths) {
    await page.setViewportSize({ width, height: 900 });
    await mountEducation(page, 10);

    const academic = await boxOf(page.locator('[data-slot="education-academic"]'));
    const credentials = await boxOf(page.locator('[data-slot="education-credentials"]'));
    const columns = await page.locator('[data-slot="credential-list"]').evaluate((list) =>
      getComputedStyle(list).gridTemplateColumns.split(" ").filter(Boolean).length,
    );

    if (width >= 1024) expect(Math.abs(academic.height - credentials.height)).toBeLessThanOrEqual(1);
    expect(await page.locator('[data-slot="education-academic"]').evaluate((element) => getComputedStyle(element).paddingBottom)).toBe("0px");
    expect(Math.abs(academic.y - credentials.y) <= 1).toBe(width >= 1024);
    expect(columns).toBe(width >= 768 ? 2 : 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("Education lets Academic use the space left by credential content", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mountEducation(page, 2);

  const titles = page.locator('[data-slot="credential-title"]');
  await titles.evaluateAll((elements) => {
    const [first, second] = elements;
    if (!first || !second) throw new Error("Expected two credential titles");
    first.textContent = "Credential A";
    second.textContent = "Credential B";
  });
  const academic = page.locator('[data-slot="education-academic"]');
  const credentials = page.locator('[data-slot="education-credentials"]');
  const shortAcademic = await boxOf(academic);
  const shortCredentials = await boxOf(credentials);

  await titles.first().evaluate((element) => {
    element.textContent = "Cloud Architecture Professional Certification";
  });
  const longAcademic = await boxOf(academic);
  const longCredentials = await boxOf(credentials);

  expect(shortAcademic.width).toBeGreaterThan(shortCredentials.width);
  expect(longCredentials.width).toBeGreaterThan(shortCredentials.width + 50);
  expect(longAcademic.width).toBeLessThan(shortAcademic.width - 50);
  expect(Math.abs(shortCredentials.x + shortCredentials.width - longCredentials.x - longCredentials.width)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("Education omits or avoids overflow cues for zero, one, and two credentials", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await mountEducation(page, 0);
  await expect(page.locator('[data-slot="education-credentials"]')).toHaveCount(0);

  for (const count of [1, 2]) {
    await mountEducation(page, count);
    const scrollport = page.locator('[data-slot="credential-scrollport"]');
    const columns = await page.locator('[data-slot="credential-list"]').evaluate((list) =>
      getComputedStyle(list).gridTemplateColumns.split(" ").filter(Boolean).length,
    );
    const metrics = await scrollport.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));

    expect(columns).toBe(1);
    expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight + 1);
    await expect(page.locator('[data-slot="credential-item"]')).toHaveCount(count);
  }
});

test("Education keeps height bounded when credentials overflow", async ({ page }) => {
  const measuredHeights = new Map<number, number>();

  for (const width of educationWidths) {
    await page.setViewportSize({ width, height: 900 });
    for (const count of [3, 10, 20]) {
      await mountEducation(page, count);
      const scrollport = page.locator('[data-slot="credential-scrollport"]');
      const items = page.locator('[data-slot="credential-item"]');
      const viewport = await boxOf(scrollport);
      const firstItem = await boxOf(items.first());
      const firstLink = await boxOf(items.first().locator("a"));
      const secondItem = await boxOf(items.nth(1));
      const height = (await boxOf(page.locator('[data-slot="education-tracks"]'))).height;
      const earlierHeight = measuredHeights.get(width);

      if (earlierHeight === undefined) measuredHeights.set(width, height);
      else expect(Math.abs(earlierHeight - height)).toBeLessThanOrEqual(1);
      expect(Math.abs(firstItem.y - firstLink.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(firstItem.height - firstLink.height)).toBeLessThanOrEqual(1);
      await expect(items.first().locator("a")).toHaveCSS("padding-top", "12px");
      await expect(scrollport).toHaveCSS("scrollbar-width", "auto");
      expect(secondItem.y + secondItem.height).toBeLessThanOrEqual(viewport.y + viewport.height + 1);
      expect(await scrollport.evaluate((element) => element.scrollHeight > element.clientHeight + 1)).toBe(true);
    }
  }
});

test("Education removes borders only from the final visual row", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  for (const count of [9, 10]) {
    await mountEducation(page, count);
    const items = page.locator('[data-slot="credential-item"]');
    const finalRowStart = count % 2 === 0 ? count - 2 : count - 1;
    for (let index = 0; index < count; index += 1) {
      await expect(items.nth(index)).toHaveCSS(
        "border-bottom-width",
        index >= finalRowStart ? "0px" : "1px",
      );
    }
  }
});

test("Education keeps icon masks and badge artwork inside the shared mark slot", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await mountEducation(page, 2);

  const icon = page.locator('[data-slot="credential-icon"]');
  const badge = page.locator('[data-slot="credential-badge"]');
  expect(await icon.evaluate((element) => getComputedStyle(element).maskImage)).toContain("synthetic.svg");
  await expect(badge).toHaveCSS("object-fit", "contain");
  expect(await badge.getAttribute("alt")).toBe("");
  await expect(page.locator('[data-slot="credential-link-cue"]').first()).toBeVisible();
  await expect(page.locator('[data-slot="credential-item"] a').first()).toHaveAttribute(
    "aria-label",
    /^Verify credential:/,
  );
  const badgeBox = await boxOf(badge);
  expect(badgeBox.width).toBeCloseTo(42, 0);
  expect(badgeBox.height).toBeCloseTo(42, 0);
});

test("Education keeps enlarged credential text readable and reachable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await mountEducation(page, 20);
  await page.locator("html").evaluate((root) => {
    root.style.fontSize = "200%";
  });
  const period = page.locator('[data-slot="education-academic"] p:last-child');
  await period.evaluate((element) => {
    element.textContent = "September 2019 — June 2023";
    (element as HTMLElement).style.width = "13ch";
  });

  const scrollport = page.locator('[data-slot="credential-scrollport"]');
  const titles = page.locator('[data-slot="credential-title"]');
  expect(await titles.evaluateAll((elements) =>
    elements.every((element) => element.scrollHeight <= element.clientHeight + 1),
  )).toBe(true);
  expect(await period.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);

  const viewport = await boxOf(scrollport);
  const finalItem = page.locator('[data-slot="credential-item"]').last();
  const finalLink = finalItem.locator("a");
  await expect(finalLink).toHaveAttribute(
    "href",
    "https://example.com/credential/20",
  );
  await finalItem.evaluate((element) => {
    const viewportElement = element.closest('[data-slot="credential-scrollport"]');
    if (!(viewportElement instanceof HTMLElement)) throw new Error("Expected credential scrollport");
    viewportElement.scrollTop += element.getBoundingClientRect().top - viewportElement.getBoundingClientRect().top;
  });
  const finalItemAtTop = await boxOf(finalItem);
  expect(Math.abs(finalItemAtTop.y - viewport.y)).toBeLessThanOrEqual(1);
  await finalLink.focus();
  await expect(finalLink).toBeFocused();

  await scrollport.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const finalItemAtBottom = await boxOf(finalItem);
  expect(finalItemAtBottom.y + finalItemAtBottom.height).toBeLessThanOrEqual(
    viewport.y + viewport.height + 1,
  );
  expect(finalItemAtBottom.y + finalItemAtBottom.height).toBeGreaterThan(viewport.y);
});

test("hydrated Education preserves the approved partial-row geometry", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const failures: string[] = [];

  for (const width of educationWidths) {
    await page.setViewportSize({ width, height: 900 });
    for (const count of [3, 10, 20]) {
      await page.goto(`/?educationB1=${String(width)}-${String(count)}#education`);
      const scrollport = page.locator('[data-slot="credential-scrollport"]');
      if (await scrollport.count() === 0) {
        await expect(page.locator("#education")).toBeVisible();
        return;
      }
      await replaceHydratedCredentials(page, count);
      await expect(page.locator('[data-slot="credential-item"]')).toHaveCount(count);
      await expect(scrollport).toHaveAttribute("data-edge-fade", "end");

      const items = page.locator('[data-slot="credential-item"]');
      const viewport = await boxOf(scrollport);
      const secondItem = await boxOf(items.nth(1));
      const thirdItem = await boxOf(items.nth(2));
      const ratio = (viewport.y + viewport.height - thirdItem.y) / thirdItem.height;
      if (secondItem.y + secondItem.height > viewport.y + viewport.height + 1) {
        failures.push(`${String(width)}px/${String(count)}: second credential is clipped`);
      }
      if (ratio < 0.2 || ratio > 0.5) {
        failures.push(`${String(width)}px/${String(count)}: next credential ratio ${ratio.toFixed(3)}`);
      }
    }
  }

  expect(failures).toEqual([]);
});

test("hydrated Education updates fade cues during native keyboard scrolling", async ({ browserName, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto("/?educationB1=interaction#education");

  const scrollport = page.locator('[data-slot="credential-scrollport"]');
  if (await scrollport.count() === 0) {
    await expect(page.locator("#education")).toBeVisible();
    return;
  }

  const list = page.locator('[data-slot="credential-list"]');
  if (await list.locator('[data-slot="credential-item"]').count() <= 2) {
    await expect(scrollport).toHaveAttribute("data-edge-fade", "none");
    await expect(scrollport).toHaveAttribute("tabindex", "-1");
  }
  await replaceHydratedCredentials(page, 20);
  await expect(scrollport).toHaveAttribute("data-lenis-native-scroll");
  await expect(scrollport).toHaveAttribute("data-edge-fade", "end");
  await expect(scrollport).toHaveAttribute("tabindex", "0");
  await expect(list.locator('[data-slot="credential-item"]')).toHaveCount(20);
  await expect(list.locator("a").last()).toHaveAttribute("href", "https://example.com/credential/20");

  await scrollport.focus();
  await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
  await expect(list.locator("a").first()).toBeFocused();

  await scrollport.evaluate((element) => {
    element.scrollTop = (element.scrollHeight - element.clientHeight) / 2;
  });
  await expect.poll(() => scrollport.getAttribute("data-edge-fade")).toBe("both");

  await scrollport.focus();
  await page.keyboard.press("End");
  await expect.poll(() => scrollport.getAttribute("data-edge-fade")).toBe("start");
  await page.keyboard.press("Home");
  await expect.poll(() => scrollport.getAttribute("data-edge-fade")).toBe("end");

  await scrollport.hover();
  const pageAtTopEdge = await page.evaluate(() => scrollY);
  await page.mouse.wheel(0, -400);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(pageAtTopEdge);

  await scrollport.focus();
  await page.keyboard.press("End");
  await scrollport.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect.poll(() => scrollport.getAttribute("data-edge-fade")).toBe("start");
  const pageAtBottomEdge = await page.evaluate(() => scrollY);
  await scrollport.hover();
  await page.mouse.wheel(0, 400);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(pageAtBottomEdge);

  await replaceHydratedCredentials(page, 2);
  await expect(scrollport).toHaveAttribute("data-edge-fade", "none");
  await expect(scrollport).toHaveAttribute("tabindex", "-1");
  expect(await scrollport.evaluate((element) => element.style.height)).toBe("");
});

test("Education keeps validated content available without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto("/?educationB1=no-js#education");
    await expect(page.locator("#education")).toBeVisible();
    const links = page.locator('[data-slot="credential-item"] a');
    if (await links.count() > 0) {
      await expect(links.first()).toBeVisible();
      await expect(links.first()).toHaveAttribute("href", /^https:\/\//);
    }
  } finally {
    await context.close();
  }
});
