"use client";

import { useEffect, useState } from "react";

/**
 * Shows a fail-open readiness indicator without blocking page content.
 *
 * @returns The readiness indicator while visible, otherwise `null`.
 */
export function OpeningSplash() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => active && setVisible(true));

    void Promise.allSettled([
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
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed bottom-6 right-6 z-30 rounded-md border bg-background/95 px-5 py-4 text-right shadow-sm"
    >
      <p className="text-sm font-medium tracking-tight">Nikita Reshetnik</p>
      <div className="mt-3 h-px w-28 overflow-hidden bg-border">
        <span className="block h-full w-full animate-pulse bg-primary motion-reduce:animate-none motion-reduce:opacity-50" />
      </div>
    </div>
  );
}
