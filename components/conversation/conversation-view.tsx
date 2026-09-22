import { memo, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ComponentProps, type MouseEvent, type ReactNode, type RefObject } from "react";
import { animate, motion, useReducedMotion, type AnimationPlaybackControlsWithThen } from "motion/react";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { Check, Copy, Info, RotateCcw } from "lucide-react";
import Link from "next/link";
import { clsx } from "clsx";
import type { AskSource } from "@/lib/ask.contract";
import { conversationCitationPlugin, resolveConversationCitation } from "./conversation-citations";
import { defaultRehypePlugins, Streamdown } from "streamdown";
import { Bubble, BubbleContent, BubbleReactions } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import { Spinner } from "@/components/ui/spinner";
import {
  MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerItem,
  MessageScrollerProvider, MessageScrollerViewport, useMessageScroller, useMessageScrollerScrollable,
} from "@/components/ui/message-scroller";
import { Message, MessageContent } from "@/components/ui/message";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";
import type { ConversationTurn, UseConversationResult } from "./conversation.models";
import { chatGrowthDuration, chatMotionEase, useConversationLineReveal } from "./conversation-motion";
import { ConversationComposer } from "./conversation-composer";
import composerStyles from "./conversation-composer.module.scss";
import styles from "./conversation.module.scss";

const MotionBubble = motion.create(Bubble);
const MotionBubbleReactions = motion.create(BubbleReactions);
const noSources: readonly AskSource[] = [];

/** Resolves the mandatory sanitizer from the installed Streamdown release.
 * @returns The bundled sanitize plugin.
 * @throws When the installed renderer lacks its documented sanitizer.
 */
function getSanitizePlugin() {
  const plugin = defaultRehypePlugins.sanitize;
  if (!plugin) throw new Error("Streamdown sanitize plugin is unavailable.");
  return plugin;
}

const sanitizePlugin = getSanitizePlugin();
const reactionClasses = "pointer-events-none group-hover/bubble:pointer-events-auto has-[:focus-visible]:pointer-events-auto [@media(hover:none)]:pointer-events-auto";
const reactionButtonClasses = "text-content-foreground hover:text-foreground focus-visible:text-foreground";
const reactionControlClasses = `${reactionButtonClasses} relative border-0 hover:bg-transparent dark:hover:bg-transparent`;
const suggestionButtonClasses = `${reactionButtonClasses} relative h-auto min-h-6 max-w-full whitespace-normal bg-transparent py-0.5 text-left hover:bg-transparent dark:hover:bg-transparent [@media(pointer:coarse)]:after:absolute [@media(pointer:coarse)]:after:-inset-y-2.5 [@media(pointer:coarse)]:after:inset-x-0`;

/** Detects link activation that will replace the current browsing context.
 * @param event - React link click before Next handles navigation.
 * @returns Whether the current conversation surface should exit for navigation.
 */
function isOrdinarySameTabActivation(event: MouseEvent<HTMLAnchorElement>): boolean {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const target = event.currentTarget.target;
  return target === "" || target === "_self";
}

/** Animates an answer bubble's painted lower edge while preserving its natural layout height.
 * @param contentRef - Painted bubble content at its final natural geometry.
 * @param actionsRef - Controls that stay attached to the moving painted edge.
 * @param turn - Current answer state that can change rendered geometry.
 * @param showSuggestions - Whether completed follow-ups contribute to the action row.
 */
function useAnswerBubbleGrowth(
  contentRef: RefObject<HTMLDivElement | null>,
  actionsRef: RefObject<HTMLDivElement | null>,
  turn: ConversationTurn,
  showSuggestions: boolean,
) {
  const reducedMotion = useReducedMotion();
  const targetHeightRef = useRef<number | null>(null);
  const currentInsetRef = useRef(0);
  const animationRef = useRef<AnimationPlaybackControlsWithThen | null>(null);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) {
      targetHeightRef.current = null;
      currentInsetRef.current = 0;
      return;
    }

    const nextHeight = content.getBoundingClientRect().height;
    const previousTarget = targetHeightRef.current;
    const paintedHeight = previousTarget === null
      ? nextHeight
      : Math.max(0, previousTarget - currentInsetRef.current);

    animationRef.current?.cancel();
    animationRef.current = null;
    content.style.removeProperty("clip-path");
    delete content.dataset.bubbleGrowing;
    actionsRef.current?.style.removeProperty("transform");
    targetHeightRef.current = nextHeight;
    currentInsetRef.current = 0;

    const growth = nextHeight - paintedHeight;
    if (reducedMotion || previousTarget === null || growth < 1) return;

    const actions = actionsRef.current;
    /** Keeps the rounded paint edge and its controls on one exact timeline.
     * @param inset - Remaining hidden height in pixels.
     */
    const applyGrowth = (inset: number) => {
      currentInsetRef.current = inset;
      content.style.clipPath = `inset(0 0 ${String(inset)}px round 1.5rem)`;
      if (actions) actions.style.transform = `translateY(-${String(inset)}px)`;
    };

    let animation: AnimationPlaybackControlsWithThen;
    try {
      applyGrowth(growth);
      content.dataset.bubbleGrowing = "true";
      animation = animate(growth, 0, {
        duration: chatGrowthDuration,
        ease: chatMotionEase,
        onUpdate: applyGrowth,
      });
    } catch {
      currentInsetRef.current = 0;
      content.style.removeProperty("clip-path");
      delete content.dataset.bubbleGrowing;
      actions?.style.removeProperty("transform");
      return;
    }

    animationRef.current = animation;
    /** Releases paint-only geometry after the latest growth completes. */
    const finish = () => {
      if (animationRef.current !== animation) return;
      animationRef.current = null;
      animation.cancel();
      currentInsetRef.current = 0;
      content.style.removeProperty("clip-path");
      delete content.dataset.bubbleGrowing;
      actions?.style.removeProperty("transform");
    };
    void animation.then(finish, finish);
  }, [actionsRef, contentRef, reducedMotion, showSuggestions, turn]);

  useEffect(() => () => {
    animationRef.current?.cancel();
    currentInsetRef.current = 0;
    const content = contentRef.current;
    content?.style.removeProperty("clip-path");
    if (content) delete content.dataset.bubbleGrowing;
    actionsRef.current?.style.removeProperty("transform");
  }, [actionsRef, contentRef]);
}

/** Reveals each bubble once while sharing hover and reaction-keyboard state.
 * @param active - Whether the owning thread is open.
 * @param props - Generated bubble appearance and content.
 * @returns A bubble with brief entry motion and independently controlled reactions.
 */
function ConversationBubble({ active, ...props }: ComponentProps<typeof MotionBubble> & { active: boolean }) {
  const [keyboardReaction, setKeyboardReaction] = useState(false);
  const [entered, setEntered] = useState(false);
  if (!active && !entered) setEntered(true);
  return (
    <MotionBubble
      {...props}
      className={clsx(active && !entered && styles.bubble, props.className)}
      onAnimationEnd={(event) => { if (event.target === event.currentTarget) setEntered(true); }}
      initial="hidden"
      animate={keyboardReaction ? "visible" : "hidden"}
      whileHover="visible"
      onFocusCapture={(event) => {
        setKeyboardReaction(event.target.matches(":focus-visible") && event.target.closest("[data-hover-reaction]") !== null);
      }}
      onBlurCapture={() => { setKeyboardReaction(false); }}
    />
  );
}

/** Keeps reaction controls stationary while their visible contents animate.
 * @param className - Feature-specific pill placement and appearance.
 * @param props - Generated reaction placement, styling, and controls.
 * @returns A generated layout wrapper with stable native click targets.
 */
function ConversationReactions({ className = "", ...props }: ComponentProps<typeof BubbleReactions>) {
  return <BubbleReactions {...props} className={`${reactionClasses} bg-transparent p-0 ring-0 ${className}`} data-hover-reaction />;
}

/** Scales the pill's paint without shrinking or moving its native control.
 * @param children - Reaction icon and optional success feedback.
 * @returns Decorative pill contents using the conversation's snappy Motion timing.
 */
function ConversationReactionVisual({ children }: { children: ReactNode }) {
  const reducedMotion = useReducedMotion();
  const duration = reducedMotion ? 0 : 0.18;
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-muted ring-3 ring-background dark:ring-card [@media(hover:none)]:opacity-100! [@media(hover:none)]:transform-none!"
      data-reaction-visual
      style={{ transformOrigin: "50% 50%" }}
      variants={{
        hidden: {
          opacity: 0, scale: 0,
          transition: {
            duration, ease: [0.64, 0, 0.78, 0],
            opacity: { duration: 0, delay: duration },
          },
        },
        visible: {
          opacity: 1, scale: 1,
          transition: {
            duration, ease: chatMotionEase,
            opacity: { duration: 0 },
          },
        },
      }}
    >
      {children}
    </motion.span>
  );
}

/** Reveals the connected follow-up group with one shared background and entrance.
 * @param children - Independently actionable follow-up buttons.
 * @returns A single animated suggestion group at its natural layout size.
 */
function ConversationSuggestions({ children }: { children: ReactNode }) {
  const reducedMotion = useReducedMotion();
  return (
    <MotionBubbleReactions
      animate={{ opacity: 1, scale: 1 }}
      aria-label="Suggested questions"
      className={clsx(styles.suggestions, "static ml-auto max-w-full flex-wrap gap-y-1 translate-y-0 ring-background dark:ring-card")}
      data-suggestion-visual
      initial={reducedMotion ? false : { opacity: 0, scale: 0 }}
      role="group"
      style={{ transformOrigin: "50% 50%" }}
      transition={reducedMotion ? { duration: 0 } : {
        delay: chatGrowthDuration,
        duration: 0.18,
        ease: chatMotionEase,
        opacity: { duration: 0 },
      }}
    >
      {children}
    </MotionBubbleReactions>
  );
}

/** Copies selected text when the browser denies the asynchronous clipboard API.
 * @param text - Plain-text reply to copy.
 * @param owner - Control inside the native popover's interactive surface.
 * @returns Whether the browser accepted the copy command.
 */
function copySelectedReply(text: string, owner: HTMLElement): boolean {
  const activeElement = document.activeElement;
  const selection = window.getSelection();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()) : [];
  const field = document.createElement("textarea");
  field.value = text;
  field.readOnly = true;
  field.tabIndex = -1;
  field.setAttribute("aria-label", "Copy reply text");
  Object.assign(field.style, { position: "fixed", opacity: "0", pointerEvents: "none" });

  try {
    (owner.closest("[data-chat-surface]") ?? owner.parentElement)?.append(field);
    field.focus({ preventScroll: true });
    if (document.activeElement !== field) return false;
    field.select();
    // Safari can permit selected-text copy after rejecting the asynchronous API.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
    if (activeElement instanceof HTMLElement) activeElement.focus({ preventScroll: true });
    selection?.removeAllRanges();
    for (const range of ranges) selection?.addRange(range);
  }
}

/** Copies a completed reply with visible clipboard feedback.
 * @param mobile - Whether to render a touch-sized inline transcript action.
 * @param turn - Reply receiving the copy action.
 * @returns A desktop reaction or mobile transcript action with clipboard feedback.
 */
function ConversationCopy({ mobile, turn }: {
  mobile: boolean;
  turn: ConversationTurn;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [copyPending, setCopyPending] = useState(false);
  const copyPendingRef = useRef(false);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (copyState !== "copied" || copyPending) return;
    const timer = window.setTimeout(() => { setCopyState("idle"); }, 2_000);
    return () => { window.clearTimeout(timer); };
  }, [copyPending, copyState, turn.text]);
  const copySucceeded = copyState === "copied";
  const copyLabel = copySucceeded ? "Copied" : "Copy reply";
  const copyTitle = copyState === "failed"
    ? "Copy unavailable. Select the reply text to copy it."
    : copyLabel;

  /** Copies only the displayed plain-text reply and reports clipboard failures.
   * @param owner - Copy control anchoring the native selection fallback.
   */
  async function handleCopy(owner: HTMLElement) {
    if (copyPendingRef.current || turn.status === "pending") return;
    copyPendingRef.current = true;
    setCopyPending(true);
    if (!copySucceeded) setCopyState("idle");

    try {
      await navigator.clipboard.writeText(turn.text);
      setCopyState("copied");
    } catch {
      const copied = copySelectedReply(turn.text, owner);
      setCopyState(copied ? "copied" : "failed");
    } finally {
      copyPendingRef.current = false;
      setCopyPending(false);
    }
  }

  const liveStatus = (
    <span aria-live="polite" className="sr-only" role="status">
      {copySucceeded ? "Reply copied." : null}
      {copyState === "failed" ? "Copy unavailable. Select the reply text to copy it." : null}
    </span>
  );

  const icon = (
    <span aria-hidden className={clsx("grid place-items-center", mobile ? "size-4" : "size-3")}>
      <motion.span
        animate={{ opacity: copySucceeded ? 0 : 1 }}
        className="col-start-1 row-start-1"
        data-copy-icon="copy"
        initial={false}
        transition={{ duration: reducedMotion ? 0 : 0.18, ease: chatMotionEase }}
      >
        <Copy className={mobile ? "size-4" : "size-3"} />
      </motion.span>
      <motion.span
        animate={{ opacity: copySucceeded ? 1 : 0 }}
        className="col-start-1 row-start-1"
        data-copy-icon="check"
        initial={false}
        transition={{ duration: reducedMotion ? 0 : 0.18, ease: chatMotionEase }}
      >
        <Check className={mobile ? "size-4" : "size-3"} />
      </motion.span>
    </span>
  );
  const button = (
    <Button
      aria-disabled={copyPending || turn.status === "pending"}
      aria-label={copyLabel}
      className={mobile ? composerStyles.mobileActionButton : reactionControlClasses}
      onClick={(event) => { void handleCopy(event.currentTarget); }}
      size={mobile ? "icon" : "icon-xs"}
      title={copyTitle}
      type="button"
      variant="ghost"
    >
      {mobile ? icon : <ConversationReactionVisual>{icon}</ConversationReactionVisual>}
    </Button>
  );
  return mobile ? <>{button}{liveStatus}</> : (
    <ConversationReactions align="start" aria-label="Reply actions" className="static translate-y-0">
      {button}
      {liveStatus}
    </ConversationReactions>
  );
}

/** Explains a failed reply on hover or keyboard focus inside the native chat.
 * @param surfaceRef - Native chat surface that contains the tooltip portal.
 * @param turn - Failed reply whose safe error is displayed.
 * @returns One info reaction with a noninteractive explanation.
 */
function ConversationInfo({ surfaceRef, turn }: {
  surfaceRef: RefObject<HTMLElement | null>;
  turn: ConversationTurn;
}) {
  const tooltipId = useId();
  return (
    <Tooltip onOpenChange={(_open, details) => {
      if (details.reason === "escape-key") details.event.preventDefault();
    }}>
      <TooltipTrigger
        aria-describedby={tooltipId}
        aria-label="Failure details"
        closeOnClick={false}
        render={<span className="relative flex size-6 cursor-default items-center justify-center rounded-full outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring" tabIndex={0} />}
      >
        <ConversationReactionVisual><Info className="size-3.5" /></ConversationReactionVisual>
      </TooltipTrigger>
      {/* Keep tooltip content in the native chat's top layer through the public portal API. */}
      <TooltipPrimitive.Portal container={surfaceRef}>
        <TooltipPrimitive.Positioner align="start" className="z-50" positionMethod="fixed" side="top" sideOffset={6}>
          <TooltipPrimitive.Popup className="max-w-64 rounded-xl bg-foreground px-3 py-1.5 text-xs text-background" data-conversation-info id={tooltipId} role="tooltip">
            {turn.errorDetail ?? "The request could not be completed. No further diagnostic information is available."}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </Tooltip>
  );
}

/** Renders model Markdown through the intentionally narrow conversation allowlist.
 * @param text - Answer Markdown source.
 * @param sources - Validated terminal sources for inline citations.
 * @returns Safe prose with application-owned citations and no model-owned links or media.
 */
const ConversationMarkdown = memo(function ConversationMarkdown({
  onNavigate,
  sources = noSources,
  text,
}: {
  onNavigate?: (() => void) | undefined;
  sources?: readonly AskSource[];
  text: string;
}) {
  const answerRef = useRef<HTMLDivElement>(null);
  useConversationLineReveal(answerRef, text, sources);

  return (
    <div data-answer ref={answerRef}>
      <Streamdown
        allowedElements={["p", "br", "em", "strong", "ul", "ol", "li", "a", "span"]}
        animated={false}
        className="wrap-anywhere space-y-2 [&_li]:ml-5 [&_ol]:list-decimal [&_strong]:font-semibold [&_ul]:list-disc"
        components={{
          strong: "strong",
          /** Renders only transform-owned references as links to validated portfolio sources.
           * @param href - Sanitized anchor destination.
           * @param children - Visible citation marker.
           * @returns An application-owned citation link or inert text.
           */
          a: ({ href, children }) => {
            const citation = resolveConversationCitation(href, sources);
            return citation
              ? (
                  <Link
                    aria-label={`Source ${String(citation.index)}: ${citation.source.title}`}
                    className="text-[var(--brand-accent-text)] underline decoration-current underline-offset-3 hover:decoration-2 focus-visible:decoration-2"
                    data-answer-citation
                    href={citation.source.href}
                    onClick={(event) => { if (isOrdinarySameTabActivation(event)) onNavigate?.(); }}
                    prefetch={false}
                    title={citation.source.title}
                  >
                    {children}
                  </Link>
                )
              : <span>{children}</span>;
          },
        }}
        controls={false}
        isAnimating={false}
        linkSafety={{ enabled: false }}
        mode="streaming"
        parseIncompleteMarkdown
        plugins={{}}
        rehypePlugins={[sanitizePlugin]}
        remarkPlugins={[[conversationCitationPlugin, { sources }]]}
        remend={{
          bold: true,
          boldItalic: true,
          comparisonOperators: false,
          htmlTags: false,
          images: false,
          inlineCode: false,
          inlineKatex: false,
          italic: true,
          katex: false,
          links: false,
          setextHeadings: false,
          singleTilde: false,
          strikethrough: false,
        }}
        skipHtml
        unwrapDisallowed
      >
        {text}
      </Streamdown>
    </div>
  );
});

/** Renders one answer bubble with suggestions or recovery reactions.
 * @param active - Whether the native chat is open and can own a tooltip.
 * @param mobile - Whether the reply uses phone reading presentation.
 * @param onFollowUp - Prefills one generated continuation for editing.
 * @param onNavigate - Releases phone modality before ordinary citation navigation.
 * @param onRetry - Regenerates the exchange in place.
 * @param pending - Whether another answer is currently active.
 * @param showSuggestions - Whether this is the latest completed answer.
 * @param surfaceRef - Native chat surface that owns nested tooltips.
 * @param turn - Exchange being rendered.
 * @returns The answer text, progress, or recovery controls for one exchange.
 */
function ConversationAnswer({
  active,
  mobile,
  onFollowUp,
  onNavigate,
  onRetry,
  pending,
  showSuggestions,
  surfaceRef,
  turn,
}: {
  active: boolean;
  mobile: boolean;
  onFollowUp: (question: string) => void;
  onNavigate?: (() => void) | undefined;
  onRetry: (turnId: string) => void;
  pending: boolean;
  showSuggestions: boolean;
  surfaceRef: RefObject<HTMLElement | null>;
  turn: ConversationTurn;
}) {
  const showAnswer = turn.text.trim().length > 0;
  const showBubble = showAnswer || turn.status === "error";
  let answerVariant: "destructive" | "ghost" | "muted" = "muted";
  if (mobile) answerVariant = "ghost";
  else if (turn.status === "error") answerVariant = "destructive";
  const contentRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  useAnswerBubbleGrowth(contentRef, actionsRef, turn, showSuggestions);
  const showMobileActions = mobile && turn.status !== "pending";

  const externalActions = showMobileActions || (!mobile && showBubble && turn.status !== "stopped") ? (
    <div
      className={mobile ? composerStyles.mobileAnswerActions : "-mt-2.5 flex flex-wrap items-start justify-between gap-x-3 gap-y-5 px-3"}
      data-answer-actions
      ref={actionsRef}
    >
      {showAnswer && (turn.status === "pending" || turn.status === "complete") ? <ConversationCopy mobile={mobile} turn={turn} /> : null}
      {turn.status === "error" && active ? (
        <ConversationReactions align="start" className="static translate-y-0 p-0">
          <ConversationInfo surfaceRef={surfaceRef} turn={turn} />
        </ConversationReactions>
      ) : null}
      {mobile ? (
        <Button aria-label="Retry message" className={composerStyles.mobileActionButton} disabled={pending} onClick={() => { onRetry(turn.id); }} size="icon" title="Retry message" type="button" variant="ghost">
          <RotateCcw aria-hidden className="size-4" />
        </Button>
      ) : null}
      {!mobile && showSuggestions && turn.followUps?.length ? (
        <ConversationSuggestions>
          {turn.followUps.map(({ label, question }) => (
            <Button className={suggestionButtonClasses} disabled={pending} key={`${label}\u0000${question}`} onClick={() => { onFollowUp(question); }} size="xs" type="button" variant="ghost">
              {label}
            </Button>
          ))}
        </ConversationSuggestions>
      ) : null}
    </div>
  ) : null;

  return (
    <Message data-mobile-answer={mobile || undefined}>
      <MessageContent className="gap-1.5">
        <span className="sr-only">Reply</span>
        {turn.status === "pending" && !showAnswer ? (
          <Marker>
            <MarkerIcon><Spinner aria-hidden className="motion-reduce:animate-none" role={undefined} /></MarkerIcon>
            <MarkerContent className="shimmer">Thinking...</MarkerContent>
          </Marker>
        ) : null}
        {turn.status === "stopped" ? <Marker variant="separator"><MarkerContent>Reply stopped.</MarkerContent></Marker> : null}
        {showBubble ? (
          <div className={mobile ? styles.mobileAnswer : undefined} data-answer-presentation>
            <ConversationBubble active={active} className="w-full" variant={answerVariant}>
              <BubbleContent className="w-full space-y-2" data-answer-bubble-content ref={contentRef}>
                {showAnswer ? <ConversationMarkdown onNavigate={mobile ? onNavigate : undefined} sources={turn.status === "complete" ? turn.sources ?? noSources : noSources} text={turn.text} /> : null}
                {turn.status === "error" ? <p>{turn.error}</p> : null}
              </BubbleContent>
              {mobile ? null : externalActions}
            </ConversationBubble>
          </div>
        ) : null}
        {mobile ? externalActions : null}
      </MessageContent>
    </Message>
  );
}

/** Owns explicit desktop latest-scroll motion and its live-size follow latch.
 * @param active - Whether the conversation surface can currently scroll.
 * @param expanded - Whether transcript content is mounted.
 * @param mobile - Whether anchored phone scrolling owns the viewport instead.
 * @param historyRef - Scrollable transcript viewport.
 * @param scrollToEnd - Installed scroller action used for terminal positioning.
 * @returns Scroll cancellation, explicit follow activation, and reader-interruption state.
 */
function useLatestScrollFollow(
  active: boolean,
  expanded: boolean,
  mobile: boolean,
  historyRef: RefObject<HTMLDivElement | null>,
  scrollToEnd: ReturnType<typeof useMessageScroller>["scrollToEnd"],
) {
  const scrollAnimation = useRef<AnimationPlaybackControlsWithThen | null>(null);
  const scrollRun = useRef(0);
  const followLatest = useRef(false);

  /** Stops animated scrolling when the reader takes control or the chat closes. */
  const cancelScroll = useCallback(() => {
    scrollRun.current += 1;
    followLatest.current = false;
    scrollAnimation.current?.stop();
    scrollAnimation.current = null;
  }, []);

  /** Reaches the latest content in a bounded time, then follows live size changes. */
  const scrollToLatest = useCallback(() => {
    cancelScroll();
    if (mobile) {
      scrollToEnd({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      return;
    }
    const viewport = historyRef.current;
    if (!viewport) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      followLatest.current = true;
      scrollToEnd({ behavior: "auto" });
      return;
    }

    const start = viewport.scrollTop;
    const run = scrollRun.current;
    scrollAnimation.current = animate(0, 1, {
      duration: chatGrowthDuration,
      ease: chatMotionEase,
      /** Advances toward the live bottom and latches when reached.
       * @param progress - Normalized animation progress.
       */
      onUpdate: (progress) => {
        if (scrollRun.current !== run) return;
        if (followLatest.current) {
          viewport.scrollTop = viewport.scrollHeight;
          return;
        }
        const end = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
        viewport.scrollTop = start + (end - start) * progress;
        if (end - viewport.scrollTop <= 1) {
          followLatest.current = true;
          viewport.scrollTop = viewport.scrollHeight;
        }
      },
      /** Keeps explicit following active after the arrival animation. */
      onComplete: () => {
        if (scrollRun.current !== run) return;
        scrollAnimation.current = null;
        followLatest.current = true;
        scrollToEnd({ behavior: "auto" });
      },
    });
  }, [cancelScroll, historyRef, mobile, scrollToEnd]);

  useEffect(() => cancelScroll, [active, cancelScroll]);

  useEffect(() => {
    if (!active || mobile || !expanded) return;
    const viewport = historyRef.current;
    const content = viewport?.firstElementChild;
    if (!viewport || !content) return;
    const observer = new ResizeObserver(() => {
      if (followLatest.current) viewport.scrollTop = viewport.scrollHeight;
    });
    observer.observe(viewport);
    observer.observe(content);
    return () => { observer.disconnect(); };
  }, [active, expanded, historyRef, mobile]);

  return { cancelScroll, followLatest, scrollRun, scrollToLatest };
}

/** Renders the persistent transcript and composer inside the native popup.
 * @param active - Whether the native chat is open.
 * @param anchorTurnId - Turn admitted before this host committed.
 * @param mobile - Whether the transcript uses phone reading behavior.
 * @param model - Persistent feature state owned by the conversation hook.
 * @param onAccepted - Reports a newly admitted turn to the surface lifecycle.
 * @param onNavigate - Releases phone modality before ordinary citation navigation.
 * @param surfaceRef - Native chat surface that contains nested overlays.
 * @returns A compact initial composer that expands around transcript history.
 */
function ConversationPanel({
  active,
  anchorTurnId,
  mobile = false,
  model,
  onAccepted,
  onNavigate,
  surfaceRef,
}: ConversationViewProps) {
  const {
    expanded,
    inputRef,
    pending,
    setDraft,
    statusAnnouncement,
    turns,
  } = model;
  const { scrollToEnd, scrollToMessage } = useMessageScroller();
  const { end: canScrollToEnd } = useMessageScrollerScrollable();
  const historyRef = useRef<HTMLDivElement>(null);
  const latestFocused = useRef(false);
  const anchorRun = useRef(0);
  const consumedAnchorRun = useRef(0);
  const consumedExternalAnchor = useRef<string | undefined>(undefined);
  const [anchorIntent, setAnchorIntent] = useState<{ turnId: string; run: number } | null>(null);
  const { cancelScroll, followLatest, scrollRun, scrollToLatest } = useLatestScrollFollow(
    active, expanded, mobile, historyRef, scrollToEnd,
  );

  useLayoutEffect(() => {
    const turnId = anchorIntent?.turnId ?? anchorTurnId;
    if (!active || !turnId || !turns.some((turn) => turn.id === turnId)) return;
    if (!mobile) {
      if (!anchorIntent || anchorIntent.run === consumedAnchorRun.current) return;
      consumedAnchorRun.current = anchorIntent.run;
      scrollToLatest();
      return;
    }
    if (!anchorIntent && consumedExternalAnchor.current === turnId) return;
    if (anchorIntent && (anchorIntent.run !== anchorRun.current || anchorIntent.run === consumedAnchorRun.current)) return;
    const readerRun = scrollRun.current;
    const frame = window.requestAnimationFrame(() => {
      if (scrollRun.current !== readerRun) return;
      consumedExternalAnchor.current = turnId;
      if (anchorIntent) consumedAnchorRun.current = anchorIntent.run;
      scrollToMessage(turnId, {
        align: "start",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
    });
    return () => { window.cancelAnimationFrame(frame); };
  }, [active, anchorIntent, anchorTurnId, mobile, scrollRun, scrollToLatest, scrollToMessage, turns]);

  useEffect(() => {
    if (!canScrollToEnd && latestFocused.current) {
      latestFocused.current = false;
      if (!mobile) inputRef.current?.focus({ preventScroll: true });
    }
  }, [canScrollToEnd, inputRef, mobile]);

  /** Anchors one admitted turn and notifies the owning host lifecycle.
   * @param turnId - Stable identity returned by the model.
   */
  function handleAccepted(turnId: string) {
    anchorRun.current += 1;
    setAnchorIntent({ turnId, run: anchorRun.current });
    onAccepted?.(turnId);
  }

  /** Regenerates an exchange in place and restores focus to the composer.
   * @param turnId - Existing exchange to replace in place.
   */
  function handleRetry(turnId: string) {
    anchorRun.current += 1;
    setAnchorIntent({ turnId, run: anchorRun.current });
    model.retry(turnId);
    if (mobile) inputRef.current?.blur();
    else inputRef.current?.focus({ preventScroll: true });
  }

  /** Prefills a generated continuation for editing before explicit submission.
   * @param question - Full generated follow-up question.
   */
  function handleFollowUp(question: string) {
    if (pending) return;
    inputRef.current?.setCustomValidity("");
    setDraft(question);
    inputRef.current?.focus({ preventScroll: true });
  }

  return (
    <div className={clsx("flex min-h-0 flex-[0_1_auto] flex-col gap-5", mobile && !expanded && "justify-end")} data-conversation data-expanded={expanded} data-mobile={mobile || undefined}>
      {expanded
        ? (
            <MessageScroller className={clsx("h-auto min-h-0 flex-[0_1_auto]", mobile && styles.mobileTranscript)}>
              <MessageScrollerViewport
                aria-label="Conversation"
                className="h-auto min-h-0 pr-2"
                data-conversation-history
                data-lenis-prevent
                onKeyDown={cancelScroll}
                onPointerDown={cancelScroll}
                onScroll={(event) => {
                  // Preserve explicit latest-follow intent until a new reader gesture takes control.
                  if (!mobile && followLatest.current) event.currentTarget.scrollTop = event.currentTarget.scrollHeight;
                }}
                onTouchStart={cancelScroll}
                onWheel={cancelScroll}
                ref={historyRef}
                tabIndex={0}
              >
                <MessageScrollerContent aria-label="Conversation" aria-live="off" className="min-h-0 gap-0" role="log">
                  {turns.map((turn, index) => (
                    <MessageScrollerItem
                      className="flex flex-col gap-5"
                      data-latest={index === turns.length - 1 || undefined}
                      data-turn
                      key={turn.id}
                      messageId={turn.id}
                      scrollAnchor={mobile && index === turns.length - 1}
                      style={index === turns.length - 1 ? { contentVisibility: "visible", containIntrinsicSize: "none" } : undefined}
                    >
                      <Message align="end">
                        <MessageContent>
                          <span className="sr-only">You</span>
                          <ConversationBubble active={active} align="end" variant="secondary">
                            <BubbleContent>
                              <p className="wrap-anywhere whitespace-pre-wrap" data-user-message>{turn.question}</p>
                            </BubbleContent>
                            {!mobile && turn.status !== "pending" ? (
                              <ConversationReactions align="end" aria-label="Message actions">
                                <Button aria-label="Retry message" className={reactionControlClasses} disabled={pending} onClick={() => { handleRetry(turn.id); }} size="icon-xs" title="Retry message" type="button" variant="ghost">
                                  <ConversationReactionVisual><RotateCcw className="size-3" /></ConversationReactionVisual>
                                </Button>
                              </ConversationReactions>
                            ) : null}
                          </ConversationBubble>
                        </MessageContent>
                      </Message>
                      <ConversationAnswer
                        active={active}
                        mobile={mobile}
                        onFollowUp={handleFollowUp}
                        onNavigate={onNavigate}
                        onRetry={handleRetry}
                        pending={pending}
                        showSuggestions={turn.status === "complete" && index === turns.length - 1}
                        surfaceRef={surfaceRef}
                        turn={turn}
                      />
                    </MessageScrollerItem>
                  ))}
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton
                aria-label="Scroll to latest reply"
                behavior="auto"
                className="motion-reduce:transition-none"
                onBlur={(event) => { if (event.relatedTarget) latestFocused.current = false; }}
                onClick={(event) => {
                  event.preventDefault();
                  scrollToLatest();
                  latestFocused.current = true;
                }}
                onFocus={() => { latestFocused.current = true; }}
                style={{ bottom: "1rem", left: "50%", right: "auto", top: "auto" }}
              />
            </MessageScroller>
          )
        : null}
      <ConversationComposer mobile={mobile} model={model} onAccepted={handleAccepted} />
      <p aria-atomic="true" aria-live="polite" className="sr-only" data-conversation-status role="status">
        {statusAnnouncement}
      </p>
    </div>
  );
}

/** Properties for the active desktop or phone conversation view. */
export interface ConversationViewProps {
  active: boolean;
  anchorTurnId?: string | undefined;
  restoringHistory?: boolean;
  mobile?: boolean;
  model: UseConversationResult;
  onAccepted?: ((turnId: string) => void) | undefined;
  onNavigate?: (() => void) | undefined;
  surfaceRef: RefObject<HTMLElement | null>;
}

/** Owns the generated scroll context without changing the persistent conversation model.
 * @param mobile - Whether to use phone transcript presentation and anchored scrolling.
 * @param props - Remaining surface visibility, state, refs, and lifecycle callbacks.
 * @returns Provider-scoped transcript and composer.
 */
export function ConversationView({ mobile = false, ...props }: ConversationViewProps) {
  return (
    <MessageScrollerProvider autoScroll={!mobile && props.active && !props.restoringHistory} defaultScrollPosition={mobile ? "last-anchor" : "end"} scrollEdgeThreshold={32}>
      <ConversationPanel {...props} mobile={mobile} />
    </MessageScrollerProvider>
  );
}
