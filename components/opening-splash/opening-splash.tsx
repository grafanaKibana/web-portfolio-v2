"use client";

import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { animateMini } from "motion/react";
import { BrandMark } from "@/components/brand-mark/brand-mark";
import styles from "./opening-splash.module.scss";

const MINIMUM_VISIBLE_MS = 1_800;
const SHELL_READINESS_DEADLINE_MS = 3_000;
const IMAGE_READINESS_DEADLINE_MS = 8_000;
const REVEAL_HANDOFF_MS = 200;
const EXIT_WATCHDOG_MS = 1_000;
const REQUIRED_SELECTORS = ["[data-theme-root]", "header", "main#main"] as const;

const openingImagePreload = `
(() => {
  const script = document.currentScript;
  if (!(script instanceof HTMLScriptElement)) return;

  try {
    const sources = JSON.parse(script.dataset.openingImageSources ?? "{}");
    const primary = document.documentElement.classList.contains("dark") ? sources.dark : sources.light;
    const entries = [
      [primary, "primary"],
      ...((Array.isArray(sources.shared) ? sources.shared : []).map((source) => [source, "shared"])),
    ];

    for (const [source, kind] of entries) {
      if (typeof source !== "string" || source.length === 0) continue;
      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "image";
      link.href = source;
      link.setAttribute("fetchpriority", "high");
      link.dataset.openingImage = kind;
      document.head.append(link);
    }
  } catch {
    // The opening splash remains fail-open when preload metadata is unavailable.
  }
})();`;

type SplashPhase = "inactive" | "visible" | "exiting" | "hidden";

type SplashLifecycle = {
  active: boolean;
  published: boolean;
  reducedMotion: boolean;
  interruptExit?: () => void;
  disposeExit?: () => void;
};

/** Theme-specific fields and shared textures required for the initial hero paint. */
type OpeningImageSources = {
  light: string;
  dark: string;
  shared: readonly string[];
};

/**
 * Starts fetching the resolved-theme hero field and shared textures while the opening splash is visible.
 *
 * @param sources - Theme-specific fields and shared image sources required for the first hero paint.
 * @returns An inline preload bootstrap that executes during HTML parsing.
 */
export function OpeningImages({ sources }: { sources: OpeningImageSources }) {
  return (
    <script
      data-opening-image-sources={JSON.stringify(sources)}
      dangerouslySetInnerHTML={{ __html: openingImagePreload }}
    />
  );
}

/**
 * Publishes the page-reveal handoff once for the active lifecycle.
 *
 * @param owner - Committed lifecycle allowed to release page content.
 */
function publishCompletion(owner: SplashLifecycle) {
  if (!owner.active || owner.published) return;

  owner.published = true;
  delete document.documentElement.dataset.splashPending;
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
 * Waits for parse-time images and the Home renderer to settle before the splash reveals the page.
 * @param signal - Releases readiness listeners when the splash exits or unmounts.
 */
async function waitForOpeningImages(signal: AbortSignal) {
  if (document.readyState === "loading") {
    await new Promise<void>((resolve) => {
      document.addEventListener("DOMContentLoaded", () => {
        resolve();
      }, { once: true });
    });
  }

  const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[data-opening-image]'));
  const renderer = links.some((link) => link.dataset.openingImage === "primary")
    ? document.querySelector<HTMLCanvasElement>("canvas[data-opening-renderer]") : null;
  const rendering = new Promise<void>((resolve) => {
    if (!renderer || signal.aborted || renderer.dataset.openingRenderer !== "pending") {
      resolve();
      return;
    }
    /** Releases both subscriptions after renderer settlement or the bounded splash deadline. */
    function settle() {
      renderer?.removeEventListener("opening-renderer-settled", settle);
      signal.removeEventListener("abort", settle);
      resolve();
    }
    renderer.addEventListener("opening-renderer-settled", settle);
    signal.addEventListener("abort", settle, { once: true });
  });
  await Promise.all([rendering, Promise.allSettled(links.map(async (link) => {
    const image = new Image();
    image.decoding = "async";
    image.src = link.href;
    await image.decode();
  }))]);
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
    let shellDeadlineTimer: number | undefined;
    let imageDeadlineTimer: number | undefined;
    const readiness = new AbortController();
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

      // Presence-based visual-review mode; normal URLs always fail open.
      if (debug) return;

      const minimumVisibility = new Promise<void>((resolve) => {
        minimumTimer = window.setTimeout(resolve, MINIMUM_VISIBLE_MS);
      });
      let shellReady = false;
      const shellReadiness = waitForRequiredMarkers((value) => {
        observer = value;
      }).then(() => {
        shellReady = true;
      });
      // WebKit may keep fonts.ready pending while an image preload is in flight, even when the shell is present.
      const fontReadiness = "fonts" in document ? document.fonts.ready : Promise.resolve();
      const shellFailure = new Promise<void>((resolve) => {
        shellDeadlineTimer = window.setTimeout(() => {
          if (!shellReady) resolve();
        }, SHELL_READINESS_DEADLINE_MS);
      });
      const imageDeadline = new Promise<void>((resolve) => {
        imageDeadlineTimer = window.setTimeout(resolve, IMAGE_READINESS_DEADLINE_MS);
      });

      void Promise.race([
        Promise.all([minimumVisibility, shellReadiness, fontReadiness, waitForOpeningImages(readiness.signal)]),
        shellFailure,
        imageDeadline,
      ]).catch(() => minimumVisibility).then(() => {
        if (!owner.active) return;

        if (shellDeadlineTimer !== undefined) window.clearTimeout(shellDeadlineTimer);
        if (imageDeadlineTimer !== undefined) window.clearTimeout(imageDeadlineTimer);
        readiness.abort();
        observer?.disconnect();
        setPhase("exiting");
      });
    });

    return () => {
      owner.active = false;
      readiness.abort();
      owner.disposeExit?.();
      preference.removeEventListener("change", updatePreference);
      observer?.disconnect();
      window.cancelAnimationFrame(activationFrame);
      if (minimumTimer !== undefined) window.clearTimeout(minimumTimer);
      if (shellDeadlineTimer !== undefined) window.clearTimeout(shellDeadlineTimer);
      if (imageDeadlineTimer !== undefined) window.clearTimeout(imageDeadlineTimer);
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
