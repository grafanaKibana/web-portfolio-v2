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
  // The decorative entry is server-rendered; splash state is applied by CSS until observed.
  const [splashPending, setSplashPending] = useState(false);
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
    let frame: number | undefined;
    let keyboardBaselineHeight = window.innerHeight;
    let keyboardBaselineWidth = document.documentElement.clientWidth;
    /** Publishes visible viewport bounds as feature-local CSS variables. */
    function updateViewport() {
      const height = viewport?.height ?? window.innerHeight;
      const width = viewport?.width ?? window.innerWidth;
      const top = viewport?.offsetTop ?? 0;
      const left = viewport?.offsetLeft ?? 0;
      const scale = viewport?.scale ?? 1;
      if (scale === 1) {
        const layoutWidth = document.documentElement.clientWidth;
        if (layoutWidth !== keyboardBaselineWidth) {
          keyboardBaselineWidth = layoutWidth;
          keyboardBaselineHeight = window.innerHeight;
        }
        keyboardBaselineHeight = Math.max(keyboardBaselineHeight, window.innerHeight, height);
      }
      // Preserve the visible bottom edge even when keyboard overscroll reports bounds beyond the layout viewport.
      const values = { height, width, top, left, bottom: window.innerHeight - height - top };
      for (const [name, value] of Object.entries(values)) {
        const property = `--viewport-${name}`;
        const next = `${String(value)}px`;
        if (root?.style.getPropertyValue(property) !== next) root?.style.setProperty(property, next);
      }
      if (root) {
        root.dataset.viewportZoomed = String(scale !== 1);
        // Toolbar motion is smaller than a keyboard and must keep native fixed anchoring.
        root.dataset.viewportKeyboardVisible = String(scale === 1 && keyboardBaselineHeight - height > 120);
      }
    }
    /** Coalesces Safari's resize and pan events into one geometry update per frame. */
    function scheduleViewport() {
      frame ??= window.requestAnimationFrame(() => { frame = undefined; updateViewport(); });
    }
    updateViewport();
    window.addEventListener("resize", scheduleViewport);
    viewport?.addEventListener("resize", scheduleViewport);
    viewport?.addEventListener("scroll", scheduleViewport);
    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleViewport);
      viewport?.removeEventListener("resize", scheduleViewport);
      viewport?.removeEventListener("scroll", scheduleViewport);
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
