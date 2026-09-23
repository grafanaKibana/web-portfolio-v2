import type { Page } from "@playwright/test";

/**
 * Calculates expected page and header insets from the editable root width tokens.
 *
 * @param page - Browser page whose current viewport and root tokens are inspected.
 * @returns Expected insets and maximum content width in CSS pixels.
 */
export async function readShellWidthContract(page: Page) {
  return page.evaluate(() => {
    const rootStyle = getComputedStyle(document.documentElement);

    /** Resolves a root width token, including ch or calc values, to CSS pixels. */
    function readWidthToken(name: string) {
      const probe = document.createElement("div");
      probe.style.position = "absolute";
      probe.style.visibility = "hidden";
      probe.style.width = `var(${name})`;
      probe.style.fontFamily = rootStyle.fontFamily;
      probe.style.fontSize = rootStyle.fontSize;
      document.body.append(probe);
      const width = probe.getBoundingClientRect().width;
      probe.remove();
      return width;
    }

    const maxContentWidth = readWidthToken("--page-shell-max-width");
    const minimumDesktopGutter = readWidthToken("--page-shell-desktop-min-gutter");
    const desktop = matchMedia("(min-width: 48rem)").matches;
    const pageGutter = desktop
      ? Math.max(minimumDesktopGutter, (innerWidth - maxContentWidth) / 2)
      : readWidthToken("--page-shell-mobile-gutter");

    return {
      pageGutter,
      headerGutter: desktop ? pageGutter : Math.max(0, pageGutter - Number.parseFloat(rootStyle.fontSize) / 4),
      maxContentWidth,
      maxWidthReached: desktop && innerWidth >= maxContentWidth + 2 * minimumDesktopGutter,
    };
  });
}
