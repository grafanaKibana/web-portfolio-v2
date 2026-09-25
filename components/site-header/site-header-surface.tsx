"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";

const HEADER_SELECTOR = '[data-slot="site-header"]';
const HERO_SELECTOR = '[data-slot="hero"]';

/**
 * Keeps the sticky header transparent over the Home hero and restores its surface below it.
 *
 * @returns No markup; behavior attaches to the server-rendered header.
 */
export function SiteHeaderSurface() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    const header = document.querySelector<HTMLElement>(HEADER_SELECTOR);
    const hero = document.querySelector<HTMLElement>(HERO_SELECTOR);
    if (!header) return;

    if (!hero) {
      header.dataset.surfaceVisible = "true";
      return;
    }

    let frame: number | undefined;

    /** Updates the header surface once per animation frame during scrolling or resizing. */
    const updateSurface = () => {
      frame = undefined;
      const heroBottom = hero.getBoundingClientRect().bottom;
      const headerBottom = header.getBoundingClientRect().bottom;
      header.dataset.surfaceVisible = heroBottom <= headerBottom ? "true" : "false";
    };

    /** Coalesces viewport events into one geometry read per animation frame. */
    const scheduleUpdate = () => {
      frame ??= window.requestAnimationFrame(updateSurface);
    };

    updateSurface();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      header.dataset.surfaceVisible = "true";
    };
  }, [pathname]);

  return null;
}
