import { memo, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ChangeEvent, type ComponentProps, type KeyboardEvent, type ReactNode, type RefObject, type SyntheticEvent } from "react";
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
import { Field, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import { Spinner } from "@/components/ui/spinner";
import {
  MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerItem,
  MessageScrollerProvider, MessageScrollerViewport, useMessageScroller, useMessageScrollerScrollable,
} from "@/components/ui/message-scroller";
import { Message, MessageContent } from "@/components/ui/message";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";
import { maxConversationInputLength, type ConversationTurn, type UseConversationResult } from "./use-conversation";
import { chatGrowthDuration, chatMotionEase, useConversationLineReveal } from "./conversation-motion";
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
 * @param props - Generated bubble appearance and content.
 * @returns A bubble with brief entry motion and independently controlled reactions.
 */
function ConversationBubble(props: ComponentProps<typeof MotionBubble>) {
  const [keyboardReaction, setKeyboardReaction] = useState(false);
  return (
    <MotionBubble
      {...props}
      className={clsx(styles.bubble, props.className)}
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
      className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-muted ring-3 ring-card [@media(hover:none)]:opacity-100! [@media(hover:none)]:transform-none!"
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
      className={clsx(styles.suggestions, "static ml-auto max-w-full flex-wrap gap-y-1 translate-y-0")}
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
 * @param turn - Reply receiving the copy action.
 * @returns Left-aligned bubble reactions with clipboard feedback.
 */
function ConversationCopy({ turn }: {
  turn: ConversationTurn;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [copyPending, setCopyPending] = useState(false);
  const copyPendingRef = useRef(false);
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

  return (
    <ConversationReactions align="start" aria-label="Reply actions" className="static translate-y-0">
      <Button aria-disabled={copyPending || turn.status === "pending"} aria-label={copyLabel} className={reactionControlClasses} onClick={(event) => { void handleCopy(event.currentTarget); }} size="icon-xs" title={copyTitle} type="button" variant="ghost">
        <ConversationReactionVisual>
          {/* Keep both icons mounted for the short success crossfade. */}
          <span aria-hidden className="grid size-3 place-items-center">
            <motion.span
              animate={{ opacity: copySucceeded ? 0 : 1 }}
              className="col-start-1 row-start-1"
              data-copy-icon="copy"
              initial={false}
              transition={{ duration: 0.18, ease: chatMotionEase }}
            >
              <Copy className="size-3" />
            </motion.span>
            <motion.span
              animate={{ opacity: copySucceeded ? 1 : 0 }}
              className="col-start-1 row-start-1"
              data-copy-icon="check"
              initial={false}
              transition={{ duration: 0.18, ease: chatMotionEase }}
            >
              <Check className="size-3" />
            </motion.span>
          </span>
        </ConversationReactionVisual>
      </Button>
      <span aria-live="polite" className="sr-only" role="status">
        {copySucceeded ? "Reply copied." : null}
        {copyState === "failed" ? "Copy unavailable. Select the reply text to copy it." : null}
      </span>
    </ConversationReactions>
  );
}

/** Explains a failed reply on hover or keyboard focus inside the native chat.
 * @param surfaceRef - Native chat surface that contains the tooltip portal.
 * @param turn - Failed reply whose safe error is displayed.
 * @returns One info reaction with a noninteractive explanation.
 */
function ConversationInfo({ surfaceRef, turn }: {
  surfaceRef: RefObject<HTMLDivElement | null>;
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
const ConversationMarkdown = memo(function ConversationMarkdown({ text, sources = noSources }: { text: string; sources?: readonly AskSource[] }) {
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
              ? <Link aria-label={`Source ${String(citation.index)}: ${citation.source.title}`} className="text-[var(--brand-accent-text)] underline decoration-current underline-offset-3 hover:decoration-2 focus-visible:decoration-2" data-answer-citation href={citation.source.href} prefetch={false} title={citation.source.title}>{children}</Link>
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
 * @param onFollowUp - Prefills one generated continuation for editing.
 * @param pending - Whether another answer is currently active.
 * @param showSuggestions - Whether this is the latest completed answer.
 * @param surfaceRef - Native chat surface that owns nested tooltips.
 * @param turn - Exchange being rendered.
 * @returns The answer text, progress, or recovery controls for one exchange.
 */
function ConversationAnswer({
  active,
  onFollowUp,
  pending,
  showSuggestions,
  surfaceRef,
  turn,
}: {
  active: boolean;
  onFollowUp: (question: string) => void;
  pending: boolean;
  showSuggestions: boolean;
  surfaceRef: RefObject<HTMLDivElement | null>;
  turn: ConversationTurn;
}) {
  const showAnswer = turn.text.trim().length > 0;
  const showBubble = showAnswer || turn.status === "error";
  const contentRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  useAnswerBubbleGrowth(contentRef, actionsRef, turn, showSuggestions);

  const externalActions = showBubble && turn.status !== "stopped" ? (
    <div className="-mt-2.5 flex flex-wrap items-start justify-between gap-x-3 gap-y-5 px-3" data-answer-actions ref={actionsRef}>
      {showAnswer && (turn.status === "pending" || turn.status === "complete") ? <ConversationCopy turn={turn} /> : null}
      {turn.status === "error" && active ? (
        <ConversationReactions align="start" className="static translate-y-0 p-0">
          <ConversationInfo surfaceRef={surfaceRef} turn={turn} />
        </ConversationReactions>
      ) : null}
      {showSuggestions && turn.followUps?.length ? (
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
    <Message>
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
          <div data-answer-presentation>
            <ConversationBubble className="w-full" variant={turn.status === "error" ? "destructive" : "muted"}>
              <BubbleContent className="w-full space-y-2" data-answer-bubble-content ref={contentRef}>
                {showAnswer ? <ConversationMarkdown sources={turn.status === "complete" ? turn.sources ?? noSources : noSources} text={turn.text} /> : null}
                {turn.status === "error" ? <p>{turn.error}</p> : null}
              </BubbleContent>
              {externalActions}
            </ConversationBubble>
          </div>
        ) : null}
      </MessageContent>
    </Message>
  );
}

/** Renders the persistent transcript and composer inside the native popup.
 * @param active - Whether the native chat is open.
 * @param model - Persistent feature state owned by the conversation hook.
 * @param surfaceRef - Native chat surface that contains nested overlays.
 * @returns A compact initial composer that expands around transcript history.
 */
function ConversationPanel({ active, model, surfaceRef }: { active: boolean; model: UseConversationResult; surfaceRef: RefObject<HTMLDivElement | null> }) {
  const {
    draft,
    expanded,
    inputId,
    inputRef,
    pending,
    setDraft,
    statusAnnouncement,
    submit,
    turns,
  } = model;
  const { scrollToEnd } = useMessageScroller();
  const { end: canScrollToEnd } = useMessageScrollerScrollable();
  const historyRef = useRef<HTMLDivElement>(null);
  const scrollAnimation = useRef<AnimationPlaybackControlsWithThen | null>(null);
  const scrollRun = useRef(0);
  const followLatest = useRef(false);
  const latestFocused = useRef(false);
  const [scrollIntent, setScrollIntent] = useState<{ turns: ConversationTurn[]; retryId?: string; run: number } | null>(null);
  const consumedIntent = useRef(scrollIntent);

  /** Stops animated scrolling when the reader takes control or the chat closes. */
  const cancelScroll = useCallback(() => {
    scrollRun.current += 1;
    followLatest.current = false;
    scrollAnimation.current?.stop();
    scrollAnimation.current = null;
  }, []);

  /** Reaches the latest content in a bounded time, then resumes generated bottom following. */
  const scrollToLatest = useCallback(() => {
    cancelScroll();
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
      /** Tracks the live bottom without overriding a reader's interruption.
       * @param progress - Eased fraction of the scroll transition.
       */
      onUpdate: (progress) => {
        if (scrollRun.current !== run) return;
        const end = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
        viewport.scrollTop = start + (end - start) * progress;
      },
      /** Returns bottom following to the generated scroller after settling. */
      onComplete: () => {
        if (scrollRun.current !== run) return;
        scrollAnimation.current = null;
        followLatest.current = true;
        scrollToEnd({ behavior: "auto" });
      },
    });
  }, [cancelScroll, scrollToEnd]);

  useEffect(() => cancelScroll, [active, cancelScroll]);

  useEffect(() => {
    if (!scrollIntent || consumedIntent.current === scrollIntent) return;
    consumedIntent.current = scrollIntent;
    const accepted = scrollIntent.retryId === undefined
      ? turns.length > scrollIntent.turns.length && turns.some((turn) => !scrollIntent.turns.some((previous) => previous.id === turn.id))
      : turns.some((turn) => turn.id === scrollIntent.retryId && scrollIntent.turns.some((previous) => previous.id === turn.id && previous !== turn));
    if (accepted && scrollIntent.run === scrollRun.current) scrollToLatest();
  }, [scrollIntent, scrollToLatest, turns]);

  useEffect(() => {
    if (!canScrollToEnd && latestFocused.current) {
      latestFocused.current = false;
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [canScrollToEnd, inputRef]);

  /** Submits through the state model while retaining validation and one active request.
   * @param event - Composer form submission.
   */
  function handleSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    if (pending) return;
    setScrollIntent({ turns, run: scrollRun.current });
    submit();
    inputRef.current?.focus({ preventScroll: true });
  }

  /** Synchronizes typed input and clears any stale native validity message.
   * @param event - Composer input change.
   */
  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    event.currentTarget.setCustomValidity("");
    setDraft(event.currentTarget.value);
  }

  /** Stops streaming and restores keyboard focus to the follow-up field. */
  function handleStop() {
    model.stop();
    inputRef.current?.focus({ preventScroll: true });
  }

  /** Regenerates an exchange in place and restores focus to the composer.
   * @param turnId - Existing exchange to replace in place.
   */
  function handleRetry(turnId: string) {
    setScrollIntent({ turns, retryId: turnId, run: scrollRun.current });
    model.retry(turnId);
    inputRef.current?.focus({ preventScroll: true });
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

  /** Submits Enter while retaining Shift+Enter newlines and IME composition.
   * @param event - Composer keyboard event.
   */
  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <div className="flex min-h-0 flex-[0_1_auto] flex-col" data-conversation data-expanded={expanded}>
      {expanded
        ? (
            <MessageScroller className="h-auto min-h-0 flex-[0_1_auto]">
              <MessageScrollerViewport
                aria-label="Conversation"
                className="h-auto min-h-0 pr-2"
                data-conversation-history
                data-lenis-prevent
                onKeyDown={cancelScroll}
                onPointerDown={cancelScroll}
                onScroll={(event) => {
                  // Preserve explicit latest-follow intent until a new reader gesture takes control.
                  if (followLatest.current) event.currentTarget.scrollTop = event.currentTarget.scrollHeight;
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
                      data-turn
                      key={turn.id}
                      messageId={turn.id}
                      style={index === turns.length - 1 ? { contentVisibility: "visible", containIntrinsicSize: "none" } : undefined}
                    >
                      <Message align="end">
                        <MessageContent>
                          <span className="sr-only">You</span>
                          <ConversationBubble align="end" variant="secondary">
                            <BubbleContent>
                              <p className="wrap-anywhere whitespace-pre-wrap" data-user-message>{turn.question}</p>
                            </BubbleContent>
                            {turn.status !== "pending" ? (
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
                        onFollowUp={handleFollowUp}
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
      <form className="shrink-0" onSubmit={handleSubmit}>
        <Field>
          <FieldLabel className="sr-only" htmlFor={inputId}>Your question</FieldLabel>
          <InputGroup className="[&>button]:-my-px [&>textarea]:-my-px">
            <InputGroupTextarea autoComplete="off" className="max-h-32 min-h-9 py-1.5 [field-sizing:content]"
              id={inputId} maxLength={maxConversationInputLength} name="question" onChange={handleChange}
              onKeyDown={handleComposerKeyDown} placeholder={expanded ? "Ask a follow-up…" : "What would you like to know?"}
              ref={inputRef} required rows={1} value={draft} />
            {pending
              ? <InputGroupButton onClick={handleStop} size="sm" type="button">Stop</InputGroupButton>
              : <InputGroupButton size="sm" type="submit">Send</InputGroupButton>}
          </InputGroup>
        </Field>
      </form>
      <p aria-atomic="true" aria-live="polite" className="sr-only" data-conversation-status role="status">
        {statusAnnouncement}
      </p>
    </div>
  );
}

/** Owns the generated scroll context without changing the persistent conversation model.
 * @param props - Native popup visibility, conversation state, and overlay container.
 * @returns Provider-scoped transcript and composer.
 */
export function ConversationView(props: { active: boolean; model: UseConversationResult; surfaceRef: RefObject<HTMLDivElement | null> }) {
  return (
    <MessageScrollerProvider autoScroll defaultScrollPosition="end" scrollEdgeThreshold={32}>
      <ConversationPanel {...props} />
    </MessageScrollerProvider>
  );
}
