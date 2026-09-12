"use client";

import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { animateMini } from "motion/react";
import { BrandMark } from "../brand-mark/brand-mark";
import styles from "./opening-splash.module.scss";

const MINIMUM_VISIBLE_MS = 1_800;
const READINESS_DEADLINE_MS = 3_000;
const REVEAL_HANDOFF_MS = 200;
const EXIT_WATCHDOG_MS = 1_000;
const REQUIRED_SELECTORS = ["[data-theme-root]", "header", "main#main"] as const;

type SplashPhase = "inactive" | "visible" | "exiting" | "hidden";

type SplashLifecycle = {
  active: boolean;
  published: boolean;
  reducedMotion: boolean;
  interruptExit?: () => void;
  disposeExit?: () => void;
};

/**
 * Publishes the page-reveal handoff once for the active lifecycle.
 *
 * @param owner - Committed lifecycle allowed to release page content.
 */
function publishCompletion(owner: SplashLifecycle) {
  if (!owner.active || owner.published) return;

  owner.published = true;
  document.documentElement.dataset.splashComplete = "true";
  window.dispatchEvent(new Event("opening-splash-complete"));
}

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
 * @param role - YAML-authored primary role.
 * @returns The decorative splash markup until its exit completes.
 */
export function OpeningSplash({ role }: { role: string }) {
  const [phase, setPhase] = useState<SplashPhase>("inactive");
  const rootRef = useRef<HTMLDivElement>(null);
  const lifecycleRef = useRef<SplashLifecycle | null>(null);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const owner: SplashLifecycle = {
      active: true,
      published: false,
      reducedMotion: preference.matches,
    };
    lifecycleRef.current = owner;
    let observer: MutationObserver | undefined;
    let minimumTimer: number | undefined;
    let deadlineTimer: number | undefined;
    const debug = new URLSearchParams(window.location.search).has("debugSplash");

    /** Applies live preferences without restarting readiness or its visibility floor. */
    function updatePreference() {
      if (!owner.active) return;

      owner.reducedMotion = preference.matches;
      if (preference.matches) owner.interruptExit?.();
    }

    preference.addEventListener("change", updatePreference);

    const activationFrame = window.requestAnimationFrame(() => {
      const preactivated = document.documentElement.dataset.splashPending === "true";
      if (!debug && !preactivated) {
        publishCompletion(owner);
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
        if (!owner.active) return;

        observer?.disconnect();
        delete document.documentElement.dataset.splashPending;
        setPhase("exiting");
      });
    });

    return () => {
      owner.active = false;
      owner.disposeExit?.();
      preference.removeEventListener("change", updatePreference);
      observer?.disconnect();
      window.cancelAnimationFrame(activationFrame);
      if (minimumTimer !== undefined) window.clearTimeout(minimumTimer);
      if (deadlineTimer !== undefined) window.clearTimeout(deadlineTimer);
    };
  }, []);

  useEffect(() => {
    const owner = lifecycleRef.current;
    const root = rootRef.current;
    if (phase !== "exiting" || !owner?.active || !root) return;

    let terminal = false;
    let controls: ReturnType<typeof animateMini> | undefined;

    /** Clears coordination and failure timers on every terminal path. */
    function clearExitTimers() {
      window.clearTimeout(handoffTimer);
      window.clearTimeout(watchdogTimer);
    }

    /** Prevents cancelled playback from restoring a visible or translated cover. */
    function hideAndNeutralize() {
      if (!root) return;

      root.style.visibility = "hidden";
      root.style.opacity = "0";
      root.style.transform = "none";
    }

    /**
     * Removes healthy playback on completion and atomically settles interrupted playback.
     *
     * @param interrupted - Whether failure or a live preference change requires cancellation.
     */
    function finishExit(interrupted = false) {
      if (!owner?.active || terminal) return;

      terminal = true;
      clearExitTimers();
      if (interrupted) {
        hideAndNeutralize();
        controls?.cancel();
        hideAndNeutralize();
      }
      publishCompletion(owner);
      setPhase("hidden");
    }

    /** Invalidates callbacks before cancelling playback during effect cleanup. */
    function disposeExit() {
      terminal = true;
      clearExitTimers();
      controls?.cancel();
    }

    owner.interruptExit = () => {
      finishExit(true);
    };
    owner.disposeExit = disposeExit;
    const handoffTimer = window.setTimeout(() => {
      if (!terminal) publishCompletion(owner);
    }, REVEAL_HANDOFF_MS);
    const watchdogTimer = window.setTimeout(() => {
      finishExit(true);
    }, EXIT_WATCHDOG_MS);

    try {
      controls = animateMini(
        root,
        owner.reducedMotion
          ? { opacity: [1, 0] }
          : { transform: ["none", "translateY(100%)"] },
        {
          duration: owner.reducedMotion ? 0.32 : 0.7,
          ease: owner.reducedMotion ? [0.25, 0.1, 0.25, 1] : [0.87, 0, 0.13, 1],
          onComplete: finishExit,
        },
      );
    } catch {
      finishExit(true);
    }

    return disposeExit;
  }, [phase]);

  if (phase === "hidden") return null;

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className={clsx(styles.splash, styles[phase])}
      data-slot="opening-splash"
      data-state={phase}
    >
      <div className="text-center">
        <BrandMark className="mx-auto h-auto w-24 text-foreground md:w-32" />
        <p className="m-0 mt-4 font-mono text-xs tracking-widest text-muted-foreground">{role}</p>
      </div>
    </div>
  );
}
