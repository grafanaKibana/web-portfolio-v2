import type { Dispatch, RefObject, SetStateAction } from "react";
import type { AskCompletion, AskContext, AskFollowUp, AskSource } from "@/lib/ask.contract";

/** Answer source reported by the conversation endpoint. */
export type ConversationMode = "live";
/** Lifecycle state of one conversation turn. */
export type ConversationTurnStatus = "pending" | "complete" | "stopped" | "error";
/** One visitor question and its current answer state. */
export interface ConversationTurn {
  id: string;
  question: string;
  text: string;
  status: ConversationTurnStatus;
  mode?: ConversationMode;
  error?: string;
  errorDetail?: string;
  context?: AskContext;
  sources?: AskSource[];
  followUps?: AskFollowUp[];
}

/** Synchronous admission result for a question submitted to the conversation. */
export type ConversationSubmission = { accepted: true; turnId: string } | { accepted: false };

/** State and actions exposed by the conversation controller. */
export interface UseConversationResult {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  inputId: string;
  turns: ConversationTurn[];
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  pending: boolean;
  expanded: boolean;
  submit: () => ConversationSubmission;
  submitQuestion: (question: string) => void;
  stop: () => void;
  retry: (turnId: string) => void;
  reset: () => void;
  statusAnnouncement: string;
}

/** Request identity and cancellation owned by the React hook. */
export interface ActiveRequest {
  id: number;
  turnId: string;
  controller: AbortController;
}

/** Callbacks that receive validated answer-stream events. */
export interface AskStreamCallbacks {
  onMetadata: (mode: ConversationMode) => void;
  onDelta: (text: string) => void;
}

/** Terminal data returned after a complete answer stream. */
export type AskStreamResult = AskCompletion;

/** Invocation-local protocol sequencing state. */
export interface StreamState {
  metadata: boolean;
  answered: boolean;
  answerLength: number;
  completion?: AskCompletion;
  done: boolean;
}

/** Readonly browser policy injected into the stateless conversation service. */
export interface ConversationServiceConfiguration {
  readonly askBrowserTimeoutMs: number;
  readonly maxHistoryPairs: number;
}

/** Transport and policy dependencies, independent of React lifecycle. */
export interface ConversationServiceDependencies {
  readonly fetcher?: typeof fetch;
  readonly configuration?: ConversationServiceConfiguration;
}
