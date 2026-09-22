import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { askSectionIds, captureAskContext } from "@/lib/section-context";
import { ConversationService } from "./conversation.service";
import { AskStreamError } from "./conversation.errors";
import { conversationConfig } from "./conversation.config";
import type { ActiveRequest, ConversationSubmission, ConversationTurn, UseConversationResult } from "./conversation.models";

const { genericError, maxConversationInputLength } = conversationConfig;

/** Owns in-memory conversation state and guards every stream update by request identity.
 * @param pathname - Current portfolio route pathname.
 * @returns Persistent transcript state and request actions for the conversation view.
 */
export function useConversation(pathname: string): UseConversationResult {
  const [service] = useState(() => new ConversationService());
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputId = useId();
  const nextTurnId = useRef(1);
  const nextRequestId = useRef(0);
  const activeRequest = useRef<ActiveRequest | null>(null);
  const turnsRef = useRef<ConversationTurn[]>([]);
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [draft, setDraftState] = useState("");
  const [statusAnnouncement, setStatusAnnouncement] = useState("");

  /** Replaces transcript state and its synchronous request-building mirror together.
   * @param next - Complete next transcript.
   */
  const replaceTurns = useCallback((next: ConversationTurn[]) => {
    turnsRef.current = next;
    setTurns(next);
  }, []);

  /** Applies a transcript update against the latest synchronous state.
   * @param update - Pure transcript update.
   */
  const updateTurns = useCallback((update: (current: ConversationTurn[]) => ConversationTurn[]) => {
    replaceTurns(update(turnsRef.current));
  }, [replaceTurns]);

  /** Invalidates active callbacks before aborting and optionally marks their turn stopped.
   * @param markStopped - Whether an active pending turn becomes stopped.
   */
  const invalidateActive = useCallback((markStopped: boolean) => {
    const active = activeRequest.current;
    nextRequestId.current += 1;
    activeRequest.current = null;
    active?.controller.abort();
    if (markStopped && active) {
      updateTurns((current) => current.map((turn) => turn.id === active.turnId && turn.status === "pending"
        ? { ...turn, status: "stopped" }
        : turn));
    }
  }, [updateTurns]);

  /** Starts transport for one existing turn and ignores all stale callbacks.
   * @param snapshot - Transcript used to construct bounded request history.
   * @param turnId - Turn receiving this answer.
   */
  const startRequest = useCallback((snapshot: ConversationTurn[], turnId: string) => {
    const controller = new AbortController();
    const requestId = nextRequestId.current;
    activeRequest.current = { id: requestId, turnId, controller };
    /** Checks that a callback still belongs to the active request and target turn.
     * @returns Whether both request and turn identifiers still match.
     */
    const current = () => activeRequest.current?.id === requestId
      && activeRequest.current.turnId === turnId;

    void Promise.resolve().then(() => service.stream(service.buildRequest(snapshot, turnId), controller.signal, {
      /** Stores accepted stream mode on the active turn.
       * @param mode - Validated mock or live response mode.
       */
      onMetadata: (mode) => {
        if (!current()) return;
        updateTurns((existing) => existing.map((turn) => turn.id === turnId && turn.status === "pending"
          ? { ...turn, mode }
          : turn));
      },
      /** Appends one accepted text delta to the active turn.
       * @param text - Validated non-empty answer fragment.
       */
      onDelta: (text) => {
        if (!current()) return;
        updateTurns((existing) => existing.map((turn) => turn.id === turnId && turn.status === "pending"
          ? { ...turn, text: turn.text + text }
          : turn));
      },
    })).then((completion) => {
      if (!current()) return;
      activeRequest.current = null;
      updateTurns((existing) => existing.map((turn) => turn.id === turnId && turn.status === "pending"
        ? { ...turn, status: "complete", sources: completion.sources, followUps: completion.followUps }
        : turn));
      setStatusAnnouncement("Answer complete.");
    }).catch((error: unknown) => {
      if (!current() || controller.signal.aborted) return;
      activeRequest.current = null;
      const message = error instanceof Error ? error.message : genericError;
      const errorDetail = error instanceof AskStreamError ? error.detail : undefined;
      updateTurns((existing) => existing.map((turn) => turn.id === turnId && turn.status === "pending"
        ? { ...turn, status: "error", error: message, ...(errorDetail ? { errorDetail } : {}) }
        : turn));
      setStatusAnnouncement(message);
    });
  }, [service, updateTurns]);

  /** Keeps the controlled draft synchronized and clears stale native validity.
   * @param next - Draft value or state updater.
   */
  const setDraft: Dispatch<SetStateAction<string>> = useCallback((next) => {
    setDraftState((current) => typeof next === "function" ? next(current) : next);
    inputRef.current?.setCustomValidity("");
  }, []);

  /** Appends one valid question with an immutable view-context snapshot.
   * @param question - Full visitor or generated follow-up question.
   * @param clearDraft - Whether the submitted text came from the composer.
   * @returns Synchronous admission result without changing rejected drafts.
   */
  const submitValue = useCallback((question: string, clearDraft: boolean): ConversationSubmission => {
    if (activeRequest.current) return { accepted: false };
    question = question.trim();
    if (!question || question.length > maxConversationInputLength) {
      inputRef.current?.setCustomValidity(question
        ? `Keep the question to ${maxConversationInputLength.toLocaleString("en-US")} characters or fewer.`
        : "Write a question first.");
      inputRef.current?.reportValidity();
      return { accepted: false };
    }
    const turn: ConversationTurn = {
      id: String(nextTurnId.current++),
      question,
      text: "",
      status: "pending",
      context: captureAskContext(pathname, askSectionIds),
    };
    const snapshot = [...turnsRef.current, turn];
    replaceTurns(snapshot);
    if (clearDraft) setDraftState("");
    setStatusAnnouncement("");
    inputRef.current?.setCustomValidity("");
    startRequest(snapshot, turn.id);
    return { accepted: true, turnId: turn.id };
  }, [pathname, replaceTurns, startRequest]);

  /** Submits the current composer draft.
   * @returns Whether a turn was admitted, with its stable identity.
   */
  const submit = useCallback(() => {
    return submitValue(draft, true);
  }, [draft, submitValue]);

  /** Submits a generated follow-up while preserving an unrelated composer draft.
   * @param question - Validated full follow-up question.
   */
  const submitQuestion = useCallback((question: string) => {
    submitValue(question, false);
  }, [submitValue]);

  /** Stops the active answer while preserving all received text. */
  const stop = useCallback(() => {
    invalidateActive(true);
    setStatusAnnouncement("");
  }, [invalidateActive]);

  /** Regenerates one turn in place using only completed exchanges preceding it.
   * @param turnId - Existing exchange to regenerate.
   */
  const retry = useCallback((turnId: string) => {
    if (!turnsRef.current.some((turn) => turn.id === turnId)) return;
    invalidateActive(true);
    const snapshot = turnsRef.current.map((turn) => turn.id === turnId
      ? {
          id: turn.id,
          question: turn.question,
          text: "",
          status: "pending" as const,
          ...(turn.context ? { context: turn.context } : {}),
        }
      : turn);
    replaceTurns(snapshot);
    setStatusAnnouncement("");
    startRequest(snapshot, turnId);
  }, [invalidateActive, replaceTurns, startRequest]);

  /** Clears all conversation memory after invalidating active work. */
  const reset = useCallback(() => {
    invalidateActive(false);
    replaceTurns([]);
    setDraftState("");
    setStatusAnnouncement("");
    inputRef.current?.setCustomValidity("");
  }, [invalidateActive, replaceTurns]);

  useEffect(() => () => {
    nextRequestId.current += 1;
    const active = activeRequest.current;
    activeRequest.current = null;
    active?.controller.abort();
  }, []);

  return {
    inputRef,
    inputId,
    turns,
    draft,
    setDraft,
    pending: turns.some((turn) => turn.status === "pending"),
    expanded: turns.length > 0,
    submit,
    submitQuestion,
    stop,
    retry,
    reset,
    statusAnnouncement,
  };
}
