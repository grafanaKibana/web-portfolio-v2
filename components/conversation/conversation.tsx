"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
  type ToggleEvent,
} from "react";
import { flushSync } from "react-dom";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { MessageCirclePlus, Sparkle, X } from "lucide-react";
import { clsx } from "clsx";
import { animateMini, useReducedMotion, type AnimationPlaybackControlsWithThen } from "motion/react";
import { Button } from "@/components/ui/button";
import { ConversationComposer, ConversationFieldSurface, conversationPlaceholder } from "./conversation-composer";
import { ConversationView } from "./conversation-view";
import { chatGrowthDuration, chatMotionEase } from "./conversation-motion";
import { useConversation } from "./use-conversation";
import { useConversationShell } from "./use-conversation-shell";
import styles from "./conversation.module.scss";

type SurfaceMorphPhase = "opening" | "closing";
type ConversationDismiss = (intent?: "dismiss" | "navigate" | "reset", nativeClosing?: boolean) => void;

/** Returns the visible composer group whose box transfers between page and thread.
 * @param owner - Page shell or native host containing a composer.
 * @returns The active shadcn input group, when mounted.
 */
function findComposerGroup(owner: ParentNode): HTMLElement | null {
  return owner.querySelector<HTMLElement>('[data-conversation-composer] [data-slot="input-group"]');
}

/** Describes a screen-space rectangle as a clip polygon relative to one element.
 * @param bounds - Element box that owns the clip path.
 * @param visible - Screen-space rectangle that should remain visible.
 * @returns A four-corner polygon that can extend beyond the owning box.
 */
function rectClipPath(bounds: DOMRect, visible: DOMRect): string {
  const left = visible.left - bounds.left;
  const right = visible.right - bounds.left;
  const top = visible.top - bounds.top;
  const bottom = visible.bottom - bounds.top;
  return `polygon(${String(left)}px ${String(top)}px, ${String(right)}px ${String(top)}px, ${String(right)}px ${String(bottom)}px, ${String(left)}px ${String(bottom)}px)`;
}

/** Removes transient inline geometry from one morph-owned element.
 * @param element - Element returning to stylesheet-owned geometry.
 * @param properties - Inline properties written by the morph controller.
 */
function clearInlineProperties(element: HTMLElement | null, properties: readonly string[]) {
  if (!element) return;
  for (const property of properties) element.style.removeProperty(property);
}

/** Clears every inline value owned by the surface morph controller.
 * @param surface - Animated conversation surface.
 */
function clearSurfaceMotionStyles(surface: HTMLElement) {
  const frame = surface.querySelector<HTMLElement>("[data-chat-frame]");
  const line = surface.querySelector<HTMLElement>("[data-chat-morph-line]");
  const composer = findComposerGroup(surface);
  clearInlineProperties(frame, ["clip-path", "opacity"]);
  clearInlineProperties(line, ["bottom", "left", "opacity", "transform"]);
  clearInlineProperties(composer, ["opacity", "transform"]);
  clearInlineProperties(surface.querySelector<HTMLElement>("[data-composer-surface]"), ["width", "height", "border-color"]);
  clearInlineProperties(surface.querySelector<HTMLElement>("[data-composer-accent]"), ["opacity"]);
  for (const element of surface.querySelectorAll<HTMLElement>("[data-composer-content]")) element.style.removeProperty("opacity");
  for (const element of surface.querySelectorAll<HTMLElement>("[data-chat-reveal], [data-conversation-history]")) element.style.removeProperty("opacity");
  surface.style.removeProperty("height");
  delete surface.dataset.morph;
  delete surface.dataset.morphDestination;
}

/** Releases transient paint after the native host completes its motion.
 * @param surface - Native host whose completed paint may be released.
 * @param phase - Completed transfer direction.
 */
function releaseSurfaceMotion(surface: HTMLElement, phase: SurfaceMorphPhase) {
  if (phase === "closing") {
    if (surface.dataset.morphDestination !== "field") surface.closest<HTMLElement>("[data-conversation-shell]")?.removeAttribute("data-morph");
    clearClosingSurface(surface);
  }
  clearSurfaceMotionStyles(surface);
}

/** Removes temporary semantics and paint state after a native popup has closed.
 * @param surface - Closing native popup surface.
 */
function clearClosingSurface(surface: HTMLElement) {
  surface.style.removeProperty("height");
  clearClosingSemantics(surface);
}

/** Restores native interaction semantics without disturbing sampled morph geometry.
 * @param surface - Native host returning from a detached closing state.
 */
function clearClosingSemantics(surface: HTMLElement) {
  surface.inert = false;
  surface.removeAttribute("aria-hidden");
  delete surface.dataset.closing;
}

/** Moves the composer between the thread and its page field or line destination.
 * @param originRef - Page field or line geometry used for the composer transfer.
 * @param completionRef - Current lifecycle continuation guarded by the morph generation.
 * @returns Native toggle handlers for preparing and revealing the popup.
 */
function useSurfaceToggleMotion(
  originRef: RefObject<DOMRect | null>,
  completionRef: RefObject<((phase: SurfaceMorphPhase) => void) | null>,
) {
  const reducedMotion = useReducedMotion();
  const animationsRef = useRef<AnimationPlaybackControlsWithThen[]>([]);
  const generationRef = useRef(0);

  /** Invalidates current playback without allowing a stale completion to mutate lifecycle. */
  const cancelAnimations = useCallback(() => {
    generationRef.current += 1;
    for (const animation of animationsRef.current) animation.cancel();
    animationsRef.current = [];
  }, []);

  useEffect(() => () => {
    cancelAnimations();
  }, [cancelAnimations]);

  /** Runs independent panel reveal and composer transfer.
   * @param surface - Mounted native host whose natural target geometry is authoritative.
   * @param phase - Whether the target is the open panel or captured page entry.
   */
  const morphSurface = useCallback((surface: HTMLElement, phase: SurfaceMorphPhase) => {
    const frame = surface.querySelector<HTMLElement>("[data-chat-frame]");
    const line = surface.querySelector<HTMLElement>("[data-chat-morph-line]");
    const composer = findComposerGroup(surface);
    const paint = composer?.querySelector<HTMLElement>("[data-composer-surface]");
    const accent = composer?.querySelector<HTMLElement>("[data-composer-accent]");
    const origin = originRef.current;
    if (!frame || !line || !composer || !paint || !accent) {
      cancelAnimations();
      releaseSurfaceMotion(surface, phase);
      const completion = completionRef.current;
      completionRef.current = null;
      completion?.(phase);
      return;
    }

    const interrupted = animationsRef.current.length > 0;
    const currentFrameOpacity = interrupted ? Number.parseFloat(window.getComputedStyle(frame).opacity) : null;
    const currentFrameClip = interrupted ? window.getComputedStyle(frame).clipPath : null;
    const currentPaint = interrupted ? paint.getBoundingClientRect() : null;
    const currentAccentOpacity = interrupted ? Number.parseFloat(window.getComputedStyle(accent).opacity) : null;
    const controls = Array.from(composer.querySelectorAll<HTMLElement>("[data-composer-content]"));
    const currentControlOpacity = interrupted ? controls.map((element) => Number.parseFloat(window.getComputedStyle(element).opacity)) : [];
    const currentComposerTransform = interrupted ? window.getComputedStyle(composer).transform : null;
    const currentRevealOpacity = interrupted
      ? Array.from(surface.querySelectorAll<HTMLElement>("[data-chat-reveal], [data-conversation-history]"), (element) => Number.parseFloat(window.getComputedStyle(element).opacity))
      : [];
    cancelAnimations();
    clearSurfaceMotionStyles(surface);

    const composerTarget = composer.getBoundingClientRect();
    const surfaceTarget = surface.getBoundingClientRect();
    const fullClip = "polygon(0px 0px, 100% 0px, 100% 100%, 0px 100%)";
    const lineTarget = DOMRect.fromRect({
      x: composerTarget.left + (composerTarget.width - line.offsetWidth) / 2,
      y: composerTarget.bottom - line.offsetHeight,
      width: line.offsetWidth,
      height: line.offsetHeight,
    });
    const returningToField = phase === "closing" && Boolean(origin && origin.width > line.offsetWidth);
    const mobile = surface.dataset.mobile === "true";
    const panelDuration = mobile ? (phase === "opening" ? 0.56 : 0.5) : (phase === "opening" ? 0.34 : 0.3);
    const fieldDuration = mobile ? panelDuration + 0.14 : panelDuration;
    const ease = mobile ? [0.4, 0, 0.2, 1] as const : chatMotionEase;

    surface.dataset.morph = phase;
    if (phase === "closing") surface.dataset.morphDestination = returningToField ? "field" : "line";
    const revealElements = Array.from(surface.querySelectorAll<HTMLElement>("[data-chat-reveal], [data-conversation-history]"));

    if (reducedMotion) {
      releaseSurfaceMotion(surface, phase);
      const completion = completionRef.current;
      completionRef.current = null;
      completion?.(phase);
      return;
    }

    const animations: AnimationPlaybackControlsWithThen[] = [];
    animationsRef.current = animations;
    animations.push(animateMini(frame, {
      opacity: [currentFrameOpacity ?? (phase === "opening" ? 0 : 1), phase === "opening" ? 1 : 0],
      clipPath: phase === "opening"
        ? [currentFrameClip && currentFrameClip !== "none" ? currentFrameClip : rectClipPath(surfaceTarget, composerTarget), fullClip]
        : [currentFrameClip && currentFrameClip !== "none" ? currentFrameClip : fullClip, rectClipPath(surfaceTarget, composerTarget)],
    }, { duration: panelDuration, ease }));
    const destination = origin ?? lineTarget;
    const openingFromLine = phase === "opening" && destination.height <= line.offsetHeight;
    const movingToLine = phase === "closing" && !returningToField;
    const offset = `translate(${String(destination.left + destination.width / 2 - (composerTarget.left + composerTarget.width / 2))}px, ${String(destination.bottom - composerTarget.bottom)}px)`;
    animations.push(animateMini(composer, {
      transform: [currentComposerTransform && currentComposerTransform !== "none" ? currentComposerTransform : phase === "opening" ? offset : "translate(0px, 0px)", phase === "opening" ? "translate(0px, 0px)" : offset],
    }, { duration: fieldDuration, ease }));
    animations.push(animateMini(paint, {
      width: [currentPaint?.width ?? (phase === "opening" ? destination.width : composerTarget.width), phase === "opening" ? composerTarget.width : destination.width],
      height: [currentPaint?.height ?? (phase === "opening" ? destination.height : composerTarget.height), phase === "opening" ? composerTarget.height : destination.height],
    }, { duration: fieldDuration, ease }));
    animations.push(animateMini(accent, {
      opacity: [currentAccentOpacity ?? (openingFromLine ? 1 : 0), movingToLine ? 1 : 0],
    }, { delay: movingToLine ? fieldDuration * 0.6 : 0, duration: movingToLine ? fieldDuration * 0.4 : 0.18, ease }));
    controls.forEach((element, index) => {
      const leaving = movingToLine || (returningToField && element.hasAttribute("data-mobile-suggestions"));
      animations.push(animateMini(element, {
        opacity: [currentControlOpacity[index] ?? (openingFromLine ? 0 : 1), leaving ? 0 : 1],
      }, { delay: openingFromLine ? fieldDuration * 0.7 : 0, duration: openingFromLine ? fieldDuration * 0.3 : Math.min(0.12, fieldDuration), ease }));
    });
    revealElements.forEach((element, index) => {
      animations.push(animateMini(element, {
        opacity: [currentRevealOpacity[index] ?? (phase === "opening" ? 0 : 1), phase === "opening" ? 1 : 0],
      }, {
        delay: phase === "opening" ? panelDuration * 0.28 : 0,
        duration: phase === "opening" ? panelDuration * 0.65 : panelDuration * (mobile ? 0.85 : 0.32),
        ease,
      }));
    });
    const generation = generationRef.current;

    /** Releases only the latest morph and then advances its native lifecycle. */
    const finish = () => {
      if (generationRef.current !== generation || animationsRef.current !== animations) return;
      animationsRef.current = [];
      const completion = completionRef.current;
      completionRef.current = null;
      if (surface.dataset.morphDestination === "field") {
        // Mount and focus the replacement before removing the outgoing field's paint.
        flushSync(() => { completion?.(phase); });
        releaseSurfaceMotion(surface, phase);
      } else {
        releaseSurfaceMotion(surface, phase);
        completion?.(phase);
      }
    };
    void Promise.allSettled(animations.map((animation) => animation.then(() => undefined, () => undefined))).then(finish);
  }, [cancelAnimations, completionRef, originRef, reducedMotion]);

  const collapseSurface = useCallback((surface: HTMLElement) => {
    clearClosingSurface(surface);
    surface.dataset.closing = "true";
    surface.inert = true;
    surface.setAttribute("aria-hidden", "true");
    try {
      morphSurface(surface, "closing");
    } catch {
      cancelAnimations();
      releaseSurfaceMotion(surface, "closing");
      const completion = completionRef.current;
      completionRef.current = null;
      completion?.("closing");
    }
  }, [cancelAnimations, completionRef, morphSurface]);

  const handleBeforeToggle = useCallback((event: ToggleEvent<HTMLDivElement>) => {
    if (event.newState === "open") {
      const reversing = animationsRef.current.length > 0 && event.currentTarget.dataset.closing === "true";
      clearClosingSemantics(event.currentTarget);
      if (!reversing) {
        cancelAnimations();
        clearSurfaceMotionStyles(event.currentTarget);
      }
    } else collapseSurface(event.currentTarget);
  }, [cancelAnimations, collapseSurface]);

  const revealSurface = useCallback((surface: HTMLElement) => {
    try {
      morphSurface(surface, "opening");
    } catch {
      cancelAnimations();
      clearSurfaceMotionStyles(surface);
      const completion = completionRef.current;
      completionRef.current = null;
      completion?.("opening");
    }
  }, [cancelAnimations, completionRef, morphSurface]);

  return { cancelAnimations, collapseSurface, handleBeforeToggle, revealSurface };
}

/** Animates content-driven height changes, releasing the surface back to intrinsic sizing after each transition.
 * @param open - Whether the native conversation is open.
 * @param model - Content changes that can resize the transcript or composer.
 * @param surfaceRef - Native surface whose natural height remains the sizing authority.
 * @returns Callback recording the first visible height after native opening.
 */
function useSurfaceContentMotion(open: boolean, model: ReturnType<typeof useConversation>, surfaceRef: RefObject<HTMLElement | null>) {
  const reducedMotion = useReducedMotion();
  const previousHeight = useRef<number | null>(null);
  const animationRef = useRef<AnimationPlaybackControlsWithThen | null>(null);

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const from = animationRef.current ? surface.getBoundingClientRect().height : previousHeight.current;
    animationRef.current?.cancel();
    animationRef.current = null;
    if (!open || surface.dataset.morph || surface.dataset.closing || !surface.matches(":popover-open")) {
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

  /** Records visible initial geometry without animating from a hidden zero-height host. */
  return useCallback(() => {
    const surface = surfaceRef.current;
    if (surface?.matches(":popover-open")) previousHeight.current = surface.getBoundingClientRect().height;
  }, [surfaceRef]);
}

/** Tracks each arrival at the page end so an explicit close can leave its line resting.
 * @returns Current end visibility and arrival number.
 */
function useAtPageEnd() {
  const [position, setPosition] = useState({ atPageEnd: false, pageEndVisit: 0 });
  useEffect(() => {
    /** Measures the actual document edge without inferring intent from scroll direction. */
    function updatePageEnd() {
      const root = document.documentElement;
      const atPageEnd = window.scrollY + window.innerHeight >= root.scrollHeight - 2;
      setPosition((current) => current.atPageEnd === atPageEnd ? current : {
        atPageEnd, pageEndVisit: current.pageEndVisit + (atPageEnd ? 1 : 0),
      });
    }
    updatePageEnd();
    window.addEventListener("scroll", updatePageEnd, { passive: true });
    window.addEventListener("resize", updatePageEnd);
    return () => {
      window.removeEventListener("scroll", updatePageEnd);
      window.removeEventListener("resize", updatePageEnd);
    };
  }, []);

  return position;
}

/** Pointer ownership retained while the typing handle is engaged. */
interface ConversationGesture {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  moved: boolean;
}

/** Offers a tap, keyboard and bounded downward-drag dismissal on the typing chrome.
 * @param dismiss - Shared one-shot dismissal action.
 * @param gestureRef - Pointer ownership consulted by keyboard recovery.
 * @param handleRef - Stable focus target consulted by typing ownership.
 * @returns Accessible close handle.
 */
function ConversationHandle({ dismiss, gestureRef, handleRef }: {
  dismiss: () => void;
  gestureRef: RefObject<ConversationGesture | null>;
  handleRef: RefObject<HTMLButtonElement | null>;
}) {
  const suppressClick = useRef(false);
  /** Cancels pointer ownership and resets paint without converting the gesture into a click.
   * @param element - Handle that owns capture and transient paint.
   * @param pointerId - Owned pointer identity.
   */
  function cancelGesture(element: HTMLButtonElement, pointerId: number) {
    if (!gestureRef.current || gestureRef.current.id !== pointerId) return;
    suppressClick.current = true;
    gestureRef.current = null;
    element.style.removeProperty("transform");
    if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
  }

  return (
        <button
          aria-label="Close conversation"
          className={styles.typingHandle}
          data-conversation-handle
          onClick={(event) => { if (event.detail !== 0 && suppressClick.current) { suppressClick.current = false; return; } dismiss(); }}
          onLostPointerCapture={(event) => { cancelGesture(event.currentTarget, event.pointerId); }}
          onPointerCancel={(event) => { cancelGesture(event.currentTarget, event.pointerId); }}
          onPointerDown={(event) => {
            event.currentTarget.focus({ preventScroll: true });
            if (gestureRef.current) { cancelGesture(event.currentTarget, gestureRef.current.id); return; }
            suppressClick.current = false;
            gestureRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dy: 0, moved: false };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const drag = gestureRef.current;
            if (!drag || drag.id !== event.pointerId) return;
            drag.dx = event.clientX - drag.x;
            drag.dy = event.clientY - drag.y;
            drag.moved ||= Math.hypot(drag.dx, drag.dy) > 8;
            if (drag.moved) suppressClick.current = true;
            event.currentTarget.style.transform = `translateY(${String(Math.min(64, Math.max(0, drag.dy)))}px)`;
          }}
          onPointerUp={(event) => {
            const drag = gestureRef.current;
            if (!drag || drag.id !== event.pointerId) return;
            gestureRef.current = null;
            event.currentTarget.style.removeProperty("transform");
            event.currentTarget.releasePointerCapture(event.pointerId);
            if (drag.moved) suppressClick.current = true;
            if (drag.dy >= 64 && drag.dy >= 1.5 * Math.abs(drag.dx)) dismiss();
          }}
          ref={handleRef}
          type="button"
        ><span aria-hidden /></button>
  );
}

/** Clears residual textarea typing chrome after corroborated keyboard recovery.
 * @param mobile - Whether phone presentation is active.
 * @param open - Whether a thread is open.
 * @param typing - Explicit composing focus state.
 * @param setTyping - Updates composing chrome.
 * @param inputRef - Current composer.
 * @param gestureRef - Active handle pointer ownership.
 */
function useTypingRecovery(mobile: boolean, open: boolean, typing: boolean, setTyping: (typing: boolean) => void,
  inputRef: RefObject<HTMLTextAreaElement | null>, gestureRef: RefObject<ConversationGesture | null>) {
  useEffect(() => {
    if (!mobile || !open) return;
    const viewport = window.visualViewport;
    let baseline = viewport?.height ?? window.innerHeight;
    let contracted = false;
    /** Uses keyboard recovery only to clear residual textarea focus, never handle ownership. */
    function recoverKeyboard() {
      if (!viewport || viewport.scale !== 1) return;
      if (!typing) { baseline = Math.max(baseline, viewport.height); return; }
      if (viewport.height < baseline - 120) contracted = true;
      if (contracted && viewport.height >= baseline - 60 && !gestureRef.current
        && document.activeElement === inputRef.current) {
        contracted = false;
        setTyping(false);
      }
    }
    viewport?.addEventListener("resize", recoverKeyboard);
    return () => { viewport?.removeEventListener("resize", recoverKeyboard); };
  }, [gestureRef, mobile, inputRef, open, setTyping, typing]);

}

/** Closes a native host only while it is open.
 * @param host - Dialog or popover whose lifecycle has already been consumed.
 */
function closeNativeHost(host: HTMLElement) {
  if (host instanceof HTMLDialogElement) { if (host.open) host.close(); }
  else if (host.matches(":popover-open")) host.hidePopover();
}

/** Routes mobile composer boundary tabbing to its mounted typing handle.
 * @param event - Interior keyboard event.
 * @param input - Current composer input.
 * @param handle - Mounted typing handle, absent outside mobile typing.
 */
function focusTypingHandle(event: KeyboardEvent<HTMLDivElement>, input: HTMLTextAreaElement | null, handle: HTMLButtonElement | null) {
  if (!handle || event.key !== "Tab"
    || event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
  const actions = input?.form?.querySelectorAll("button:not(:disabled):not([tabindex='-1'])");
  const boundary = event.shiftKey ? input : actions?.item(actions.length - 1);
  if (event.target !== boundary) return;
  event.preventDefault();
  handle.focus({ preventScroll: true });
}

/** Focuses the desktop composer after reveal unless the reader has moved focus elsewhere.
 * @param surface - Current desktop host and operation identity.
 * @param inputRef - Current shared composer input.
 * @param titleRef - Noneditable initial focus target.
 * @param launcherRef - Stable launcher allowed to hand focus into the panel.
 */
function focusDesktopComposer(surface: HTMLElement, inputRef: RefObject<HTMLTextAreaElement | null>,
  titleRef: RefObject<HTMLHeadingElement | null>, launcherRef: RefObject<HTMLButtonElement | null>) {
  const identity = surface.dataset.operation;
  const animations = surface.querySelector("[data-chat-paint]")?.getAnimations() ?? [];
  void Promise.allSettled(animations.map(({ finished }) => finished)).then(() => {
    if (!surface.isConnected || !surface.matches(":popover-open") || surface.dataset.operation !== identity) return;
    const active = document.activeElement;
    if (active === titleRef.current || active === launcherRef.current || active === document.body) inputRef.current?.focus({ preventScroll: true });
  });
}

/** Tracks actual document input modality for desktop focus handoff and launcher focus paint.
 * @returns Stable modality ref and whether pointer interaction owns focus appearance.
 */
function useConversationInputModality() {
  const pointerTypeRef = useRef("mouse");
  const [pointerFocus, setPointerFocus] = useState(false);
  useEffect(() => {
    /** Records pointer intent before native focus can change.
     * @param event - Document pointer activation.
     */
    function handlePointer(event: PointerEvent) {
      pointerTypeRef.current = event.pointerType;
      setPointerFocus(true);
    }
    /** Restores visible keyboard treatment for native Escape and Tab as well as shell keys. */
    function handleKey() {
      pointerTypeRef.current = "keyboard";
      setPointerFocus(false);
    }
    document.addEventListener("pointerdown", handlePointer, true);
    document.addEventListener("keydown", handleKey, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointer, true);
      document.removeEventListener("keydown", handleKey, true);
    };
  }, []);
  return { pointerTypeRef, pointerFocus };
}

/** Locks page scrolling while a phone thread owns focus, preserving prior inline styles.
 * @returns One-shot unlock with optional restoration of the reader's page position.
 */
function lockConversationDocument() {
  const root = document.documentElement;
  const body = document.body;
  const x = window.scrollX;
  const y = window.scrollY;
  const previous = [root, body].flatMap((element) => ["overflow-x", "overflow-y"].map((property) => ({
    element, property, value: element.style.getPropertyValue(property), priority: element.style.getPropertyPriority(property),
  })));
  for (const { element, property } of previous) element.style.setProperty(property, "hidden");
  let released = false;
  return (restore: boolean) => {
    if (released) return;
    released = true;
    for (const { element, property, value, priority } of previous) {
      if (value) element.style.setProperty(property, value, priority);
      else element.style.removeProperty(property);
    }
    if (restore) window.scrollTo({ left: x, top: y, behavior: "instant" });
  };
}

/** Properties shared by the responsive native hosts' single interior tree. */
interface ConversationInteriorProps {
  active: boolean;
  anchorTurnId: string | undefined;
  dismiss: ConversationDismiss;
  gestureRef: RefObject<ConversationGesture | null>;
  handleRef: RefObject<HTMLButtonElement | null>;
  mobile: boolean;
  restoringHistory: boolean;
  model: ReturnType<typeof useConversation>;
  onAccepted: (turnId: string) => void;
  onNavigate: () => void;
  setTyping: (typing: boolean) => void;
  surfaceRef: RefObject<HTMLElement | null>;
  titleRef: RefObject<HTMLHeadingElement | null>;
  typing: boolean;
}

/** Renders the one transcript and composer tree transferred between native hosts.
 * @param active - Whether the native host is open.
 * @param anchorTurnId - Turn aligned after admission.
 * @param dismiss - Shared close and reset controller.
 * @param gestureRef - Current mobile handle gesture.
 * @param handleRef - Mobile handle focus target.
 * @param mobile - Whether the compact host is active.
 * @param model - Shared conversation state and actions.
 * @param onAccepted - Handles an admitted question.
 * @param onNavigate - Closes before internal navigation.
 * @param restoringHistory - Defers automatic desktop scrolling during retained-thread opening.
 * @param setTyping - Updates compact typing chrome.
 * @param surfaceRef - Active native host.
 * @param titleRef - Initial dialog focus target.
 * @param typing - Whether the compact composer owns typing focus.
 * @returns Conversation chrome and content.
 */
function ConversationInterior({
  active, anchorTurnId, dismiss, gestureRef, handleRef, mobile, model, onAccepted, restoringHistory,
  onNavigate, setTyping, surfaceRef, titleRef, typing,
}: ConversationInteriorProps) {
  return (
    <div
      className={styles.interior}
      data-chat-paint
      data-typing={mobile && typing}
      onKeyDownCapture={(event) => { if (mobile && typing) focusTypingHandle(event, model.inputRef.current, handleRef.current); }}
      onFocusCapture={(event) => {
        if (event.target instanceof HTMLTextAreaElement && event.target === model.inputRef.current) setTyping(true);
        else if (event.target instanceof HTMLHeadingElement) setTyping(false);
      }}
      onBlurCapture={() => {
        window.requestAnimationFrame(() => {
          if (!model.inputRef.current?.closest("[data-conversation-composer]")?.contains(document.activeElement) && document.activeElement !== handleRef.current && !gestureRef.current) setTyping(false);
        });
      }}
      onPointerDownCapture={(event) => { if (event.target instanceof HTMLTextAreaElement && event.target === model.inputRef.current) setTyping(true); }}
    >
      <h2 className="sr-only" id="portfolio-conversation-title" ref={titleRef} tabIndex={-1}>About my work</h2>
      <div className={styles.headerChrome} data-header-chrome data-typing={mobile && typing} data-chat-reveal>
        <div className={styles.headerControls} data-conversation-header inert={mobile && typing} aria-hidden={mobile && typing || undefined}>
          {model.expanded ? <Button aria-label={mobile ? "New chat" : "Start over"} onPointerDown={(event) => { if (!mobile && event.pointerType !== "touch" && event.button === 0) event.preventDefault(); }} onClick={() => { dismiss("reset"); }} size="icon" type="button" variant="ghost"><MessageCirclePlus aria-hidden /></Button> : <span />}
          <Button aria-label="Close conversation" className={styles.closeButton} onClick={() => { dismiss(); }} size="icon" type="button" variant="ghost"><X aria-hidden /></Button>
        </div>
        {mobile ? <div className={styles.handleSlot} inert={!typing} aria-hidden={!typing || undefined}>
          <ConversationHandle dismiss={dismiss} gestureRef={gestureRef} handleRef={handleRef} />
        </div> : null}
      </div>
      <ConversationView active={active} anchorTurnId={anchorTurnId} mobile={mobile} model={model} restoringHistory={restoringHistory} onAccepted={onAccepted} onNavigate={onNavigate} surfaceRef={surfaceRef} />
    </div>
  );
}

/** Owns page-to-host morph intent and its reset-aware completion handoff.
 * @param launcherRef - Retained launcher focused after ordinary dismissal.
 * @param reset - Clears the conversation after reset collapse completes.
 * @param rootRef - Shell containing entry and retained-field destinations.
 * @param setEntryFocused - Restores page-field focus when a new chat begins.
 * @param setRevealed - Controls the page entry's close handoff.
 * @returns Stable morph refs, state, and lifecycle actions.
 */
function useConversationMorphLifecycle(
  launcherRef: RefObject<HTMLButtonElement | null>,
  reset: () => void,
  rootRef: RefObject<HTMLDivElement | null>,
  setEntryFocused: (focused: boolean) => void,
  setRevealed: (revealed: boolean) => void,
) {
  const [anchorTurnId, setAnchorTurnId] = useState<string>();
  const [dismissalCommit, setDismissalCommit] = useState(0);
  const [morphPhase, setMorphPhase] = useState<SurfaceMorphPhase | null>(null);
  const entryOrigin = useRef<DOMRect | null>(null);
  const morphPhaseRef = useRef<SurfaceMorphPhase | null>(null);
  const morphCompletionRef = useRef<((phase: SurfaceMorphPhase) => void) | null>(null);
  const resetPendingRef = useRef(false);

  /** Updates rendered and imperative morph state together for native event ordering.
   * @param phase - Current transfer direction, or null once stable.
   */
  const updateMorphPhase = useCallback((phase: SurfaceMorphPhase | null) => {
    morphPhaseRef.current = phase;
    setMorphPhase(phase);
  }, []);

  /** Starts an opening transfer from the last visible page object.
   * @param origin - Actual source field, retained field, or line rectangle.
   */
  const prepareOpening = useCallback((origin: DOMRect | null) => {
    entryOrigin.current = origin;
    updateMorphPhase("opening");
    morphCompletionRef.current = (phase) => { if (phase === "opening") updateMorphPhase(null); };
  }, [updateMorphPhase]);

  /** Discards an in-flight visual transfer when navigation removes the native host. */
  const cancelMorph = useCallback(() => {
    resetPendingRef.current = false;
    morphCompletionRef.current = null;
    setDismissalCommit(0);
    updateMorphPhase(null);
  }, [updateMorphPhase]);

  /** Captures the page destination and prepares one inverse surface handoff.
   * @param shouldReset - Whether completion should reset history into an active page field.
   */
  const prepareClosing = useCallback((shouldReset: boolean) => {
    if (morphPhaseRef.current === "closing") return;
    const root = rootRef.current;
    const line = root?.querySelector<HTMLElement>("[data-entry-stroke]");
    const entry = root?.querySelector<HTMLElement>("[data-edge-entry]");
    const surface = root?.querySelector<HTMLElement>("[data-chat-surface]");
    const composer = surface ? findComposerGroup(surface) : null;
    const lineBounds = line?.getBoundingClientRect();
    if (shouldReset && entry && composer && lineBounds) {
      const entryBounds = entry.getBoundingClientRect();
      const row = composer.querySelector<HTMLElement>("[data-composer-row]");
      const rowHeight = row ? Number.parseFloat(window.getComputedStyle(row).minHeight) : composer.getBoundingClientRect().height - 2;
      const lift = Number.parseFloat(window.getComputedStyle(entry).getPropertyValue("--revealed-field-lift")) || 0;
      const bottom = lineBounds.bottom - lift;
      entryOrigin.current = DOMRect.fromRect({ x: entryBounds.left, y: bottom - rowHeight - 2, width: entryBounds.width, height: rowHeight + 2 });
    } else entryOrigin.current = lineBounds ?? null;
    resetPendingRef.current = shouldReset;
    if (!shouldReset) setRevealed(false);
    updateMorphPhase("closing");
    morphCompletionRef.current = (phase) => {
      if (phase !== "closing") return;
      if (resetPendingRef.current) {
        resetPendingRef.current = false;
        reset();
        setAnchorTurnId(undefined);
        setEntryFocused(true);
        setRevealed(true);
        updateMorphPhase(null);
        return;
      }
      updateMorphPhase(null);
      setDismissalCommit((current) => current + 1);
    };
  }, [reset, rootRef, setEntryFocused, setRevealed, updateMorphPhase]);

  useLayoutEffect(() => {
    if (dismissalCommit === 0) return;
    const active = document.activeElement;
    if (active === document.body || active === document.documentElement || active?.closest("[data-chat-surface]") || (active && rootRef.current?.contains(active))) {
      launcherRef.current?.focus({ preventScroll: true });
    }
    setRevealed(false);
  }, [dismissalCommit, launcherRef, rootRef, setRevealed]);

  return { anchorTurnId, cancelMorph, entryOrigin, morphCompletionRef, morphPhase, prepareClosing, prepareOpening, setAnchorTurnId };
}

/** Mounts one conversation model across direct entry and mutually exclusive native hosts.
 * @returns Responsive conversation controls with progressive Contact fallback.
 */
export function Conversation() {
  const pathname = usePathname();
  const model = useConversation(pathname);
  const stop = model.stop;
  const rootRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const surfaceRef = useRef<HTMLElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const { pointerTypeRef, pointerFocus } = useConversationInputModality();
  const handleRef = useRef<HTMLButtonElement>(null);
  const operation = useRef<{ id: number; host: HTMLElement; consumed: boolean } | null>(null);
  const sequence = useRef(0);
  const unlockRef = useRef<((restore: boolean) => void) | null>(null);
  const exitIntent = useRef<"dismiss" | "navigate" | "unmount">("unmount");
  const scrollPosition = useRef(0);
  const [entryFocusCommit, setEntryFocusCommit] = useState(0);
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [entryFocused, setEntryFocused] = useState(false);
  const [suppressedPageEndVisit, setSuppressedPageEndVisit] = useState(0);
  const [typing, setTyping] = useState(false);
  const waitForPointerMoveRef = useRef(false);
  const { atPageEnd, pageEndVisit } = useAtPageEnd();
  const gestureRef = useRef<ConversationGesture | null>(null);
  const previouslyOpen = useRef(false);
  const { anchorTurnId, cancelMorph, entryOrigin, morphCompletionRef, morphPhase, prepareClosing, prepareOpening, setAnchorTurnId } = useConversationMorphLifecycle(
    launcherRef, model.reset, rootRef, setEntryFocused, setRevealed,
  );
  const { cancelAnimations, collapseSurface, handleBeforeToggle, revealSurface } = useSurfaceToggleMotion(entryOrigin, morphCompletionRef);

  /** Applies a close intent once, before native callbacks can re-enter dismissal.
   * @param intent - User dismissal restores position; navigation preserves the destination.
   * @param nativeClosing - Whether beforetoggle already owns native closure.
   */
  const dismiss = useCallback((intent: "dismiss" | "navigate" | "reset" = "dismiss", nativeClosing = false) => {
    const current = operation.current;
    if (intent !== "navigate") { waitForPointerMoveRef.current = true; setSuppressedPageEndVisit(pageEndVisit); }
    if (intent === "navigate") {
      cancelAnimations();
      cancelMorph();
      setRevealed(false);
      const host = current?.host ?? surfaceRef.current;
      if (host) {
        clearSurfaceMotionStyles(host);
        clearClosingSurface(host);
      }
    }
    if (!current || current.consumed) return;
    if (intent !== "navigate" && !nativeClosing) prepareClosing(intent === "reset");
    if (!nativeClosing && intent !== "navigate") collapseSurface(current.host);
    current.consumed = true;
    exitIntent.current = intent === "navigate" ? "navigate" : "dismiss";
    scrollPosition.current = current.host.querySelector<HTMLElement>("[data-conversation-history]")?.scrollTop ?? 0;
    unlockRef.current?.(intent !== "navigate");
    unlockRef.current = null;
    if (!nativeClosing) closeNativeHost(current.host);
    stop();
    gestureRef.current = null;
    setTyping(false); setOpen(false);
  }, [cancelAnimations, cancelMorph, collapseSurface, pageEndVisit, prepareClosing, stop]);

  const dismissForShell = useCallback(() => { dismiss("navigate"); }, [dismiss]);
  const { capability, compact: mobile, hidden } = useConversationShell({ pathname, rootRef, dismiss: dismissForShell });
  const recordSurfaceHeight = useSurfaceContentMotion(open && !mobile && morphPhase === null, model, surfaceRef);

  useLayoutEffect(() => {
    const host = surfaceRef.current;
    const transferring = previouslyOpen.current && open;
    previouslyOpen.current = open;
    if (!open || !host) return;
    const current = { id: ++sequence.current, host, consumed: false };
    operation.current = current;
    exitIntent.current = "unmount";
    host.dataset.operation = String(current.id);
    if (mobile) {
      unlockRef.current = lockConversationDocument();
      clearClosingSurface(host);
      clearSurfaceMotionStyles(host);
      (host as HTMLDialogElement).showModal();
      if (!transferring) revealSurface(host);
    } else {
      host.showPopover();
      if (!transferring) revealSurface(host);
      recordSurfaceHeight();
    }
    titleRef.current?.focus({ preventScroll: true });
    const history = host.querySelector<HTMLElement>("[data-conversation-history]");
    if (history && !anchorTurnId) history.scrollTop = scrollPosition.current;

    return () => {
      if (!current.consumed) scrollPosition.current = host.querySelector<HTMLElement>("[data-conversation-history]")?.scrollTop ?? scrollPosition.current;
      current.consumed = true;
      if (operation.current === current) operation.current = null;
      // Detached old hosts cannot own native callbacks or animation after a responsive transfer.
      const detachedDismissal = exitIntent.current === "dismiss" && host.dataset.closing === "true";
      if (!detachedDismissal) for (const animation of host.getAnimations({ subtree: true })) animation.cancel();
      closeNativeHost(host);
      if (!detachedDismissal) {
        for (const animation of host.getAnimations({ subtree: true })) animation.cancel();
        clearClosingSurface(host);
        clearSurfaceMotionStyles(host);
      }
      unlockRef.current?.(exitIntent.current !== "navigate");
      unlockRef.current = null;
    };
    // Content mutations must not reopen the host or reacquire its document lock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mobile]);

  useEffect(() => () => {
    cancelAnimations();
  }, [cancelAnimations]);

  useLayoutEffect(() => {
    if ((entryFocusCommit === 0 && !entryFocused) || open || model.expanded) return;
    const input = model.inputRef.current;
    if (input?.closest("[data-edge-entry]")) input.focus({ preventScroll: true });
  }, [entryFocusCommit, entryFocused, model.expanded, model.inputRef, open]);

  useTypingRecovery(mobile, open, typing, setTyping, model.inputRef, gestureRef);

  /** Opens a committed host only after a question has entered the shared model.
   * @param turnId - Stable admitted turn used for a single post-commit anchor.
   */
  function handleAccepted(turnId: string) {
    if (!open) prepareOpening(findComposerGroup(rootRef.current ?? document)?.getBoundingClientRect() ?? null);
    setTyping(false);
    setAnchorTurnId(turnId);
    setOpen(true);
  }

  /** Reveals first entry or reopens retained history without focusing an editable control. */
  function handleLauncherClick() {
    if (open) { dismiss(); return; }
    if (model.expanded) {
      const entry = rootRef.current?.querySelector<HTMLElement>("[data-edge-entry]");
      prepareOpening(entry?.querySelector<HTMLElement>(entry.dataset.entryRevealed === "true" ? "[data-reopen-field]" : "[data-entry-stroke]")?.getBoundingClientRect() ?? null);
      setAnchorTurnId(undefined);
      setOpen(true);
    } else {
      setEntryFocused(true);
      setEntryFocusCommit((current) => current + 1);
    }
  }

  /** Consumes only current-host native closure, treating untagged browser exits as dismissal.
   * @param host - Native host that emitted the close notification.
   */
  function handleNativeClose(host: HTMLElement) {
    const current = operation.current;
    if (!current || current.host !== host || current.consumed) return;
    if (host instanceof HTMLDialogElement ? host.open : host.matches(":popover-open")) return;
    dismiss();
  }

  /** Keeps native popover animation presentation separate from lifecycle effects.
   * @param event - Native popover state notification.
   */
  function handleToggle(event: ToggleEvent<HTMLDivElement>) {
    if (event.currentTarget !== operation.current?.host) return;
    if (event.newState === "open") {
      if (pointerTypeRef.current !== "touch") focusDesktopComposer(event.currentTarget, model.inputRef, titleRef, launcherRef);
    } else handleNativeClose(event.currentTarget);
  }

  const entryRevealed = !open && ((atPageEnd && pageEndVisit !== suppressedPageEndVisit) || (model.expanded
    ? revealed
    : entryFocused || Boolean(model.draft) || revealed));
  const contents = <ConversationInterior active={open} restoringHistory={morphPhase === "opening" && !anchorTurnId} anchorTurnId={anchorTurnId} dismiss={dismiss} gestureRef={gestureRef} handleRef={handleRef} mobile={mobile} model={model} onAccepted={handleAccepted} onNavigate={dismissForShell} setTyping={setTyping} surfaceRef={surfaceRef} titleRef={titleRef} typing={typing} />;

  return (
    <div className={styles.shell} data-capability={capability} data-compact={mobile} data-conversation-shell data-hidden={hidden} data-morph={morphPhase ?? undefined} data-open={open} data-pointer-focus={pointerFocus} ref={rootRef}>
      {capability === "supported" ? (
        <>
          <div
            className={styles.edgeEntry}
            data-edge-entry
            data-entry-revealed={entryRevealed}
            data-has-history={model.expanded}
            onFocusCapture={(event) => { setEntryFocused(true); if (event.target instanceof HTMLElement && event.target.hasAttribute("data-launcher") && !model.expanded) handleLauncherClick(); }}
            onBlurCapture={(event) => {
              if (event.currentTarget.contains(event.relatedTarget)) return;
              setEntryFocused(false);
              const retainsHover = !mobile && window.matchMedia("(hover: hover)").matches && event.currentTarget.matches(":hover");
              if (!retainsHover) setRevealed(false);
            }}
            onPointerEnter={() => { if (!mobile && !waitForPointerMoveRef.current && window.matchMedia("(hover: hover)").matches) setRevealed(true); }}
            onPointerMove={() => {
              if (mobile || !waitForPointerMoveRef.current || !window.matchMedia("(hover: hover)").matches) return;
              waitForPointerMoveRef.current = false; setRevealed(true);
            }}
            onPointerLeave={() => {
              waitForPointerMoveRef.current = false;
              if ((model.expanded || !entryFocused) && pointerTypeRef.current !== "touch") setRevealed(false);
            }}
          >
            <div className={styles.entryFade} data-entry-fade data-visible={entryRevealed} aria-hidden />
            {!open && !model.expanded ? <div className={styles.entryField} inert={!entryRevealed}><ConversationComposer entry mobile={mobile} model={model} onAccepted={handleAccepted} /></div> : null}
            <Button aria-controls={open || model.expanded ? "portfolio-conversation" : undefined} aria-expanded={model.expanded ? open : entryRevealed} aria-haspopup="dialog" aria-label={model.expanded ? conversationPlaceholder : "Ask about my work"} className={styles.edgeButton} data-launcher onClick={handleLauncherClick} onPointerDown={(event) => { if (!model.expanded && !open) { event.preventDefault(); handleLauncherClick(); } }} ref={launcherRef} tabIndex={entryRevealed && !model.expanded ? -1 : undefined} type="button" variant="ghost">
              {model.expanded ? <span aria-hidden className={clsx(styles.reopenLabel, "field-surface field-control")} data-reopen-field><ConversationFieldSurface /><Sparkle data-composer-content /><span data-composer-content>{conversationPlaceholder}</span></span> : null}
            </Button>
            <span aria-hidden className={styles.entryStroke} data-entry-stroke />
          </div>
          {open || model.expanded ? (mobile ? (
            <dialog aria-labelledby="portfolio-conversation-title" className={clsx(styles.surface, styles.mobileSurface)} data-chat-surface data-mobile="true" id="portfolio-conversation" onCancel={(event) => { event.preventDefault(); dismiss(); }} onClose={(event) => { handleNativeClose(event.currentTarget); }} ref={(node) => { surfaceRef.current = node; }}>
              <div aria-hidden className={styles.morphFrame} data-chat-frame><span className={styles.morphFill} data-chat-frame-fill /></div>
              <span aria-hidden className={styles.morphLine} data-chat-morph-line />
              {contents}
            </dialog>
          ) : (
            <div aria-labelledby="portfolio-conversation-title" className={styles.surface} data-chat-surface data-mobile="false" id="portfolio-conversation" onBeforeToggle={(event) => {
              if (event.newState === "open") { handleBeforeToggle(event); return; }
              const current = operation.current;
              if (!current || current.host !== event.currentTarget || current.consumed) return;
              prepareClosing(false);
              handleBeforeToggle(event);
              dismiss("dismiss", true);
            }} onToggle={handleToggle} popover="auto" ref={(node) => { surfaceRef.current = node; }} role="dialog">
              <div aria-hidden className={styles.morphFrame} data-chat-frame><span className={styles.morphFill} data-chat-frame-fill /></div>
              <span aria-hidden className={styles.morphLine} data-chat-morph-line />
              {contents}
            </div>
          )) : null}
        </>
      ) : null}
      {capability === "unsupported" ? <Link className={styles.fallback} href="/#contact">Contact me</Link> : null}
      <noscript><Link className={clsx(styles.fallback, styles.noScriptFallback)} href="/#contact">Contact me</Link></noscript>
    </div>
  );
}
