import { useEffect, useRef, useState, type RefObject } from "react";

/** Browser support state for the native conversation popover. */
export type ConversationCapability = "unknown" | "supported" | "unsupported";

interface ConversationShellOptions {
  pathname: string;
  dismiss: () => void;
  rootRef: RefObject<HTMLDivElement | null>;
}

/** Detects support only when both methods required by the popup lifecycle exist.
 * @returns Whether the browser supplies a complete native Popover API.
 */
function supportsPopover() {
  return typeof HTMLElement.prototype.showPopover === "function"
    && typeof HTMLElement.prototype.hidePopover === "function"
    && typeof HTMLDialogElement.prototype.showModal === "function";
}

/** Coordinates feature availability with viewport, focus, splash, route, and modal state.
 * @param pathname - Current client route used to dismiss on navigation.
 * @param dismiss - Lifecycle-owned navigation and shell dismissal.
 * @param rootRef - Feature root receiving visible viewport variables.
 * @returns Capability and suppression state derived from the surrounding shell.
 */
export function useConversationShell({ pathname, dismiss, rootRef }: ConversationShellOptions) {
  const initialPathnameRef = useRef(pathname);
  const [capability, setCapability] = useState<ConversationCapability>("unknown");
  const [compact, setCompact] = useState(false);
  const [splashPending, setSplashPending] = useState(true);
  const [sheetMounted, setSheetMounted] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { setCapability(supportsPopover() ? "supported" : "unsupported"); });
    return () => { window.cancelAnimationFrame(frame); };
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(width < 40rem)");
    /** Tracks whether responsive styling uses the compact entry treatment. */
    function updateCompact() { setCompact(media.matches); }
    updateCompact();
    media.addEventListener("change", updateCompact);
    return () => { media.removeEventListener("change", updateCompact); };
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    const debugSplash = new URLSearchParams(window.location.search).has("debugSplash");
    /** Mirrors the splash marker while preserving the unbounded debug review gate. */
    function updateSplash() {
      setSplashPending(html.dataset.splashPending === "true" && html.dataset.splashComplete !== "true");
    }
    updateSplash();
    const observer = new MutationObserver(updateSplash);
    observer.observe(html, { attributes: true, attributeFilter: ["data-splash-pending", "data-splash-complete"] });
    window.addEventListener("opening-splash-complete", updateSplash);
    const fallback = debugSplash ? undefined : window.setTimeout(updateSplash, 4_600);
    return () => {
      observer.disconnect();
      window.removeEventListener("opening-splash-complete", updateSplash);
      if (fallback !== undefined) window.clearTimeout(fallback);
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const viewport = window.visualViewport;
    /** Publishes visible viewport bounds as feature-local CSS variables. */
    function updateViewport() {
      const height = viewport?.height ?? window.innerHeight;
      const width = viewport?.width ?? window.innerWidth;
      const top = viewport?.offsetTop ?? 0;
      const left = viewport?.offsetLeft ?? 0;
      const values = { height, width, top, left, bottom: Math.max(0, window.innerHeight - height - top) };
      for (const [name, value] of Object.entries(values)) root?.style.setProperty(`--viewport-${name}`, `${String(value)}px`);
    }
    updateViewport();
    window.addEventListener("resize", updateViewport);
    viewport?.addEventListener("resize", updateViewport);
    viewport?.addEventListener("scroll", updateViewport);
    return () => {
      window.removeEventListener("resize", updateViewport);
      viewport?.removeEventListener("resize", updateViewport);
      viewport?.removeEventListener("scroll", updateViewport);
    };
  }, [rootRef]);

  useEffect(() => {
    /** Tracks the mounted Base UI sheet through its exit transition. */
    function updateSheet() {
      const mounted = Boolean(document.querySelector("[data-portfolio-navigation-sheet]"));
      setSheetMounted(mounted);
      if (mounted) dismiss();
    }
    updateSheet();
    const observer = new MutationObserver(updateSheet);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); };
  }, [dismiss]);

  useEffect(() => {
    if (initialPathnameRef.current === pathname) return;
    initialPathnameRef.current = pathname;
    dismiss();
  }, [dismiss, pathname]);

  return {
    capability,
    compact,
    hidden: splashPending || sheetMounted,
  };
}
