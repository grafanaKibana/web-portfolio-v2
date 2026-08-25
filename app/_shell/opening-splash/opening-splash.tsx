"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";
import styles from "./opening-splash.module.scss";

const MINIMUM_VISIBLE_MS = 300;
const READINESS_DEADLINE_MS = 3_000;
const EXIT_DURATION_MS = 320;
const REQUIRED_SELECTORS = ["[data-theme-root]", "header", "#intro-heading"] as const;

type SplashPhase = "inactive" | "visible" | "exiting" | "hidden";

/**
 * Waits for required shell markers, including markers inserted after hydration.
 *
 * @param onObserver - Receives the observer so the splash lifecycle can disconnect it.
 * @returns A promise that settles when every required marker exists.
 */
function waitForRequiredMarkers(onObserver: (observer: MutationObserver) => void) {
  return new Promise<void>((resolve) => {
    if (REQUIRED_SELECTORS.every((selector) => document.querySelector(selector))) {
      resolve();
      return;
    }

    const observer = new MutationObserver(() => {
      if (REQUIRED_SELECTORS.every((selector) => document.querySelector(selector))) {
        observer.disconnect();
        resolve();
      }
    });
    onObserver(observer);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}

/**
 * Shows the client-activated opening surface until required shell content is ready.
 *
 * @param name - YAML-authored portfolio owner name.
 * @returns The decorative splash markup until its exit completes.
 */
export function OpeningSplash({ name }: { name: string }) {
  const [phase, setPhase] = useState<SplashPhase>("inactive");

  useEffect(() => {
    let active = true;
    let observer: MutationObserver | undefined;
    let minimumTimer: number | undefined;
    let deadlineTimer: number | undefined;
    let exitTimer: number | undefined;
    const activationFrame = window.requestAnimationFrame(() => {
      setPhase("visible");

      // Temporary presence-based visual-review mode; normal URLs always fail open.
      if (new URLSearchParams(window.location.search).has("debugSplash")) return;

      const minimumVisibility = new Promise<void>((resolve) => {
        minimumTimer = window.setTimeout(resolve, MINIMUM_VISIBLE_MS);
      });
      const readiness = Promise.all([
        waitForRequiredMarkers((value) => {
          observer = value;
        }),
        "fonts" in document
          ? document.fonts.ready
          : Promise.reject(new Error("Font readiness unavailable")),
      ]);
      const deadline = new Promise<void>((resolve) => {
        deadlineTimer = window.setTimeout(resolve, READINESS_DEADLINE_MS);
      });

      void Promise.race([
        Promise.all([minimumVisibility, readiness]).catch(() => minimumVisibility),
        deadline,
      ]).then(() => {
        if (!active) return;

        observer?.disconnect();
        setPhase("exiting");
        exitTimer = window.setTimeout(() => {
          setPhase("hidden");
        }, EXIT_DURATION_MS);
      });
    });

    return () => {
      active = false;
      observer?.disconnect();
      window.cancelAnimationFrame(activationFrame);
      if (minimumTimer !== undefined) window.clearTimeout(minimumTimer);
      if (deadlineTimer !== undefined) window.clearTimeout(deadlineTimer);
      if (exitTimer !== undefined) window.clearTimeout(exitTimer);
    };
  }, []);

  if (phase === "hidden") return null;

  return (
    <div
      aria-hidden="true"
      className={clsx(styles.splash, styles[phase])}
      data-slot="opening-splash"
      data-state={phase}
    >
      <div className="text-center">
        <p className={clsx(styles.name, "text-xl font-medium max-md:text-lg")}>{name}</p>
        <div className={clsx(styles.track, "relative mt-5 overflow-hidden")}>
          <span className={clsx(styles.progress, "absolute inset-0")} />
        </div>
      </div>
    </div>
  );
}
