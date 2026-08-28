"use client";

import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import styles from "./opening-splash.module.scss";

const MINIMUM_VISIBLE_MS = 1_800;
const READINESS_DEADLINE_MS = 3_000;
const EXIT_DURATION_MS = 320;
const REQUIRED_SELECTORS = ["[data-theme-root]", "header", "main#main"] as const;

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
 * Completes the pre-paint opening surface after required shell content is ready.
 *
 * @param name - YAML-authored portfolio owner name.
 * @param role - YAML-authored primary role.
 * @returns The decorative splash markup until its exit completes.
 */
export function OpeningSplash({ name, role }: { name: string; role: string }) {
  const [phase, setPhase] = useState<SplashPhase>("inactive");
  const completionPublished = useRef(false);
  const surname = name.trim().split(/\s+/).at(-1) ?? name;

  useEffect(() => {
    let active = true;
    let observer: MutationObserver | undefined;
    let minimumTimer: number | undefined;
    let deadlineTimer: number | undefined;
    let exitTimer: number | undefined;
    const debug = new URLSearchParams(window.location.search).has("debugSplash");

    /** Publishes readiness before the splash leaves the document. */
    function publishCompletion() {
      if (completionPublished.current) return;

      completionPublished.current = true;
      document.documentElement.dataset.splashComplete = "true";
      window.dispatchEvent(new Event("opening-splash-complete"));
    }

    const activationFrame = window.requestAnimationFrame(() => {
      const preactivated = document.documentElement.dataset.splashPending === "true";
      if (!debug && !preactivated) {
        publishCompletion();
        setPhase("hidden");
        return;
      }

      setPhase("visible");

      // Temporary presence-based visual-review mode; normal URLs always fail open.
      if (debug) return;

      const minimumVisibility = new Promise<void>((resolve) => {
        minimumTimer = window.setTimeout(resolve, MINIMUM_VISIBLE_MS);
      });
      const readiness = Promise.all([
        waitForRequiredMarkers((value) => {
          observer = value;
        }),
        "fonts" in document
          ? document.fonts.ready
          : Promise.resolve(),
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
        delete document.documentElement.dataset.splashPending;
        setPhase("exiting");
        exitTimer = window.setTimeout(() => {
          publishCompletion();
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
        <p className="m-0 text-7xl font-medium uppercase tracking-tight max-md:text-5xl">{surname}</p>
        <p className="m-0 mt-4 font-mono text-xs tracking-widest text-muted-foreground">{role}</p>
      </div>
    </div>
  );
}
