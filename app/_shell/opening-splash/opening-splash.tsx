"use client";

import { useEffect, useState } from "react";

const MINIMUM_VISIBLE_MS = 1_000;

/**
 * Shows a non-blocking readiness indicator for at least one second; `?debugSplash` keeps it visible.
 *
 * @param name - YAML-authored portfolio owner name.
 * @returns The readiness indicator while visible, otherwise `null`.
 */
export function OpeningSplash({ name }: { name: string }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let active = true;
    let timeoutId: number | undefined;

    if (new URLSearchParams(window.location.search).has("debugSplash")) {
      return () => {
        active = false;
      };
    }

    const minimumVisibility = new Promise<void>((resolve) => {
      timeoutId = window.setTimeout(resolve, MINIMUM_VISIBLE_MS);
    });

    void Promise.allSettled([
      minimumVisibility,
      Promise.resolve(document.querySelector("[data-theme-root]")).then((element) => {
        if (!element) throw new Error("Theme root unavailable");
      }).catch(() => undefined),
      ("fonts" in document
        ? document.fonts.ready
        : Promise.reject(new Error("Font readiness unavailable"))).catch(() => undefined),
      Promise.resolve(document.querySelector("header")).then((element) => {
        if (!element) throw new Error("Header unavailable");
      }).catch(() => undefined),
      Promise.resolve(document.querySelector("#intro-heading")).then((element) => {
        if (!element) throw new Error("Hero unavailable");
      }).catch(() => undefined),
    ]).then(() => {
      if (active) setVisible(false);
    });

    return () => {
      active = false;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed bottom-6 right-6 z-30 rounded-md border bg-background/95 px-5 py-4 text-right shadow-sm"
      data-slot="opening-splash"
    >
      <p className="text-sm font-medium tracking-tight">{name}</p>
      <div className="mt-3 h-px w-28 overflow-hidden bg-border">
        <span className="block h-full w-full animate-pulse bg-primary motion-reduce:animate-none motion-reduce:opacity-50" />
      </div>
    </div>
  );
}
