"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type ToggleEvent,
} from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { MessageCirclePlus, Sparkle, X } from "lucide-react";
import { clsx } from "clsx";
import { animateMini, useReducedMotion, type AnimationPlaybackControlsWithThen } from "motion/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConversationView } from "./conversation-view";
import { chatGrowthDuration, chatMotionEase } from "./conversation-motion";
import { useConversation } from "./use-conversation";
import { useConversationShell } from "./use-conversation-shell";
import styles from "./conversation.module.scss";

const SURFACE_LINE_CLIP = "inset(100% max(0px, calc((100% - 7.5rem) / 2)) 0 round 999px)";
const SURFACE_LINE_TRANSFORM = "translateY(calc(1rem - var(--launcher-line-height) - 1px))";

/** Clears inline paint values owned by the conversation surface animation controller.
 * @param surface - Animated conversation surface.
 */
function clearSurfaceMotionStyles(surface: HTMLDivElement) {
  const paint = surface.querySelector<HTMLElement>("[data-chat-paint]");
  paint?.style.removeProperty("clip-path");
  paint?.style.removeProperty("opacity");
  paint?.style.removeProperty("transform");
}

/** Removes temporary semantics and paint state after a native popup has closed.
 * @param surface - Closing native popup surface.
 */
function clearClosingSurface(surface: HTMLDivElement) {
  surface.style.removeProperty("height");
  surface.inert = false;
  surface.removeAttribute("aria-hidden");
  delete surface.dataset.closing;
}

/** Coordinates Motion playback with the native popup's open and detached-close lifecycle.
 * @param stop - Synchronous request cancellation callback.
 * @returns Native toggle handlers for preparing and revealing the popup.
 */
function useSurfaceToggleMotion(stop: () => void) {
  const reducedMotion = useReducedMotion();
  const paintRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<AnimationPlaybackControlsWithThen | null>(null);
  useEffect(() => () => {
    animationRef.current?.cancel();
    animationRef.current = null;
  }, []);

  const handleBeforeToggle = useCallback((event: ToggleEvent<HTMLDivElement>) => {
    const surface = event.currentTarget;
    const paint = paintRef.current;
    if (!paint) return;
    if (event.newState === "open") {
      animationRef.current?.cancel();
      animationRef.current = null;
      clearClosingSurface(surface);
      clearSurfaceMotionStyles(surface);
      if (!reducedMotion) {
        paint.style.clipPath = SURFACE_LINE_CLIP;
        paint.style.opacity = "0";
        paint.style.transform = SURFACE_LINE_TRANSFORM;
      }
      return;
    }

    stop();
    const computed = window.getComputedStyle(paint);
    const openingClipPath = computed.clipPath === "none" ? "inset(0 round var(--surface-radius))" : computed.clipPath;
    const openingOpacity = Number(computed.opacity);
    const openingTransform = computed.transform;
    animationRef.current?.cancel();
    animationRef.current = null;
    if (reducedMotion) {
      clearSurfaceMotionStyles(surface);
      return;
    }
    let animation: AnimationPlaybackControlsWithThen;
    try {
      animation = animateMini(paint, {
        clipPath: [openingClipPath, SURFACE_LINE_CLIP],
        opacity: [openingOpacity, 0],
        transform: [openingTransform, SURFACE_LINE_TRANSFORM],
      }, { duration: 0.3, ease: chatMotionEase });
    } catch {
      for (const pendingAnimation of paint.getAnimations()) pendingAnimation.cancel();
      clearSurfaceMotionStyles(surface);
      clearClosingSurface(surface);
      return;
    }
    surface.dataset.closing = "true";
    surface.inert = true;
    surface.setAttribute("aria-hidden", "true");
    animationRef.current = animation;
    /** Clears the detached closing surface after its visual collapse. */
    const finishClosing = () => {
      if (animationRef.current !== animation) return;
      animationRef.current = null;
      clearSurfaceMotionStyles(surface);
      clearClosingSurface(surface);
    };
    void animation.then(finishClosing, finishClosing);
  }, [reducedMotion, stop]);

  const revealSurface = useCallback((surface: HTMLDivElement) => {
    const paint = paintRef.current;
    if (!paint) return;
    animationRef.current?.cancel();
    animationRef.current = null;
    if (reducedMotion) {
      clearSurfaceMotionStyles(surface);
      return;
    }
    let animation: AnimationPlaybackControlsWithThen;
    try {
      animation = animateMini(paint, {
        clipPath: [SURFACE_LINE_CLIP, "inset(0 round var(--surface-radius))"],
        opacity: [0, 1],
        transform: [SURFACE_LINE_TRANSFORM, "translateY(0)"],
      }, { duration: 0.3, ease: chatMotionEase });
    } catch {
      for (const pendingAnimation of paint.getAnimations()) pendingAnimation.cancel();
      clearSurfaceMotionStyles(surface);
      return;
    }
    animationRef.current = animation;
    /** Releases inline reveal values after current playback completes. */
    const finishOpening = () => {
      if (animationRef.current !== animation) return;
      animationRef.current = null;
      clearSurfaceMotionStyles(surface);
    };
    void animation.then(finishOpening, finishOpening);
  }, [reducedMotion]);

  return { handleBeforeToggle, paintRef, revealSurface };
}

/** Animates content-driven height changes, releasing the surface back to intrinsic sizing after each transition.
 * @param open - Whether the native conversation is open.
 * @param model - Content changes that can resize the transcript or composer.
 * @param surfaceRef - Native surface whose natural height remains the sizing authority.
 */
function useSurfaceContentMotion(open: boolean, model: ReturnType<typeof useConversation>, surfaceRef: RefObject<HTMLDivElement | null>) {
  const reducedMotion = useReducedMotion();
  const previousHeight = useRef<number | null>(null);
  const animationRef = useRef<AnimationPlaybackControlsWithThen | null>(null);

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const from = animationRef.current ? surface.getBoundingClientRect().height : previousHeight.current;
    animationRef.current?.cancel();
    animationRef.current = null;
    if (!open || surface.dataset.closing) {
      previousHeight.current = null;
      // Keep interrupted content changes from resizing the detached closing silhouette.
      if (surface.dataset.closing && from !== null) surface.style.height = `${String(from)}px`;
      if (!surface.dataset.closing) surface.style.removeProperty("height");
      return;
    }
    surface.style.removeProperty("height");
    const height = surface.getBoundingClientRect().height;
    previousHeight.current = height;
    if (reducedMotion || from === null || Math.abs(from - height) < 1) return;

    let animation: AnimationPlaybackControlsWithThen;
    try {
      animation = animateMini(surface, { height: [from, height] }, { duration: chatGrowthDuration, ease: chatMotionEase });
    } catch {
      for (const pendingAnimation of surface.getAnimations()) pendingAnimation.cancel();
      surface.style.removeProperty("height");
      return;
    }
    animationRef.current = animation;
    /** Releases only the latest resize so interrupted completions cannot replace current geometry. */
    const finish = () => {
      if (animationRef.current !== animation) return;
      animationRef.current = null;
      animation.cancel();
      surface.style.removeProperty("height");
      previousHeight.current = surface.getBoundingClientRect().height;
    };
    void animation.then(finish, finish);
  }, [model.draft, model.turns, open, reducedMotion, surfaceRef]);

  useEffect(() => () => {
    animationRef.current?.cancel();
    animationRef.current = null;
  }, []);
}

/** Mounts the site-wide native conversation and coordinates it with shell overlays.
 * @returns A progressive conversation control or an ordinary Contact fallback.
 */
export function Conversation() {
  const pathname = usePathname();
  const model = useConversation(pathname);
  const rootRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const pointerTypeRef = useRef("mouse");
  const suppressLauncherFocusRef = useRef(false);
  const focusFrameRef = useRef<number | undefined>(undefined);
  const focusOnOpenRef = useRef(false);
  const returnFocusRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const [pointerRestoredFocus, setPointerRestoredFocus] = useState(false);
  const { capability, compact, hidden } = useConversationShell({
    pathname,
    popoverRef,
    returnFocusRef,
    rootRef,
    stop: model.stop,
  });
  const { handleBeforeToggle, paintRef, revealSurface } = useSurfaceToggleMotion(model.stop);
  useSurfaceContentMotion(open, model, popoverRef);

  useEffect(() => () => {
    if (focusFrameRef.current !== undefined) window.cancelAnimationFrame(focusFrameRef.current);
  }, []);

  useEffect(() => {
    /** Marks Escape dismissal for focus return while native Popover owns closing.
     * @param event - Page keyboard event.
     */
    function handleEscape(event: KeyboardEvent) {
      if (popoverRef.current?.querySelector("[data-conversation-info][data-open]")) return;
      if (event.key === "Escape" && popoverRef.current?.matches(":popover-open")) {
        returnFocusRef.current = true;
        suppressLauncherFocusRef.current = false;
      }
    }
    document.addEventListener("keydown", handleEscape, true);
    return () => { document.removeEventListener("keydown", handleEscape, true); };
  }, []);

  /** Records activation pointer type before the native invoker toggles.
   * @param event - Launcher pointer event.
   */
  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    pointerTypeRef.current = event.pointerType;
    setKeyboardFocus(false);
    setPointerRestoredFocus(false);
  }

  /** Requests focus only for keyboard, mouse, or pen activation.
   * @param event - Launcher click used to distinguish keyboard activation.
   */
  function handleLauncherClick(event: ReactMouseEvent<HTMLButtonElement>) {
    focusOnOpenRef.current = event.detail === 0 || pointerTypeRef.current !== "touch";
    returnFocusRef.current = false;
  }

  /** Synchronizes visual state after the browser completes a native popup toggle.
   * @param event - Native popup toggle event.
   */
  function handleToggle(event: ToggleEvent<HTMLDivElement>) {
    const nextOpen = event.newState === "open";
    if (nextOpen) revealSurface(event.currentTarget);
    setOpen(nextOpen);
    setRevealed(false);
    if (focusFrameRef.current !== undefined) {
      window.cancelAnimationFrame(focusFrameRef.current);
      focusFrameRef.current = undefined;
    }
    if (nextOpen && focusOnOpenRef.current) {
      focusOnOpenRef.current = false;
      /** Waits for visible contents before moving keyboard focus into the panel. */
      function focusComposer() {
        focusFrameRef.current = window.requestAnimationFrame(() => {
          focusFrameRef.current = undefined;
          const surface = popoverRef.current;
          if (!surface?.matches(":popover-open")) return;
          const animations = paintRef.current?.getAnimations() ?? [];
          /** Moves focus only if the popup remains open after its reveal. */
          const focusVisibleComposer = () => {
            const activeElement = document.activeElement;
            if (surface.matches(":popover-open") && (activeElement === launcherRef.current || activeElement === document.body)) {
              model.inputRef.current?.focus({ preventScroll: true });
            }
          };
          if (animations.length > 0) void Promise.allSettled(animations.map(({ finished }) => finished)).then(focusVisibleComposer);
          else focusVisibleComposer();
        });
      }
      focusComposer();
      return;
    }
    if (nextOpen) return;
    focusOnOpenRef.current = false;
    if (returnFocusRef.current) {
      returnFocusRef.current = false;
      setPointerRestoredFocus(suppressLauncherFocusRef.current);
      focusFrameRef.current = window.requestAnimationFrame(() => {
        focusFrameRef.current = undefined;
        launcherRef.current?.focus({ preventScroll: true });
        suppressLauncherFocusRef.current = false;
      });
      return;
    }
    suppressLauncherFocusRef.current = false;
    setPointerRestoredFocus(false);
  }

  /** Restores launcher focus without presenting keyboard treatment after pointer activation.
   * @param event - Close activation event.
   */
  function handleClose(event: ReactMouseEvent<HTMLButtonElement>) {
    returnFocusRef.current = true;
    suppressLauncherFocusRef.current = event.detail !== 0;
  }

  /** Clears transcript memory and returns focus to the initial composer. */
  function handleReset() {
    model.reset();
    model.inputRef.current?.focus({ preventScroll: true });
  }

  const entryRevealed = !compact && !open && (revealed || (!pointerRestoredFocus && keyboardFocus));
  const entryLabel = <><Sparkle className={styles.entrySparkle} />Ask about my work</>;

  return (
    <div
      className={styles.shell}
      data-capability={capability}
      data-compact={compact}
      data-conversation-shell
      data-hidden={hidden}
      data-keyboard-focus={keyboardFocus && !pointerRestoredFocus && !open}
      data-open={open}
      data-pointer-restored-focus={pointerRestoredFocus}
      ref={rootRef}
    >
      {capability === "supported"
        ? (
            <>
              <div className={styles.edgeEntry} data-edge-entry data-entry-revealed={entryRevealed}>
                <Button
                  aria-controls="portfolio-conversation"
                  aria-expanded={open}
                  aria-haspopup="dialog"
                  aria-label="Ask about my work"
                  className={styles.edgeButton}
                  data-launcher
                  onBlur={() => { setKeyboardFocus(false); setPointerRestoredFocus(false); setRevealed(false); }}
                  onClick={handleLauncherClick}
                  onFocus={(event) => {
                    setKeyboardFocus(!suppressLauncherFocusRef.current && event.currentTarget.matches(":focus-visible"));
                  }}
                  onKeyDown={() => { pointerTypeRef.current = "keyboard"; setKeyboardFocus(true); setPointerRestoredFocus(false); }}
                  onPointerDown={handlePointerDown}
                  onPointerEnter={() => { if (!compact && !open) setRevealed(true); }}
                  onPointerLeave={() => { if (!compact) setRevealed(false); }}
                  popoverTarget="portfolio-conversation"
                  popoverTargetAction="toggle"
                  ref={launcherRef}
                  type="button"
                  variant="ghost"
                >
                  <span aria-hidden className={styles.entryStroke} data-entry-stroke />
                  {compact
                    ? <Badge aria-hidden className={styles.entryLabel} variant="ghost">{entryLabel}</Badge>
                    : <span aria-hidden className={styles.entryLabel}>{entryLabel}</span>}
                </Button>
              </div>
              <div
                aria-labelledby="portfolio-conversation-title"
                className={styles.surface}
                data-chat-surface
                id="portfolio-conversation"
                onBeforeToggle={handleBeforeToggle}
                onToggle={handleToggle}
                popover="auto"
                ref={popoverRef}
                role="dialog"
              >
                <div className={styles.interior} data-chat-paint ref={paintRef}>
                  <div className="mb-5 flex shrink-0 items-center justify-between gap-3">
                    <h2 className="text-base font-medium" id="portfolio-conversation-title">About my work</h2>
                    <div className="flex items-center gap-1">
                      {model.expanded
                        ? (
                            <Button aria-label="Start over" onClick={handleReset} size="icon" type="button" variant="ghost">
                              <MessageCirclePlus aria-hidden />
                            </Button>
                          )
                        : null}
                      <Button
                        aria-label="Close conversation"
                        className={styles.closeButton}
                        onClick={handleClose}
                        popoverTarget="portfolio-conversation"
                        popoverTargetAction="hide"
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <X aria-hidden />
                      </Button>
                    </div>
                  </div>
                  <ConversationView active={open} model={model} surfaceRef={popoverRef} />
                </div>
              </div>
            </>
          )
        : null}
      {capability === "unsupported"
        ? <Link className={styles.fallback} href="/#contact">Contact me</Link>
        : null}
      <noscript><Link className={clsx(styles.fallback, styles.noScriptFallback)} href="/#contact">Contact me</Link></noscript>
    </div>
  );
}
