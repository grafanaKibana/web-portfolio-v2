import { askLimits } from "@/lib/ask.config";

/** Browser-owned configuration for the conversation feature. */
export const conversationConfig = {
  /** Maximum duration of the browser request lifecycle. */
  askBrowserTimeoutMs: 65_000,
  /** Maximum completed exchanges included before the current question. */
  maxHistoryPairs: 5,
  /** Maximum visitor-question length accepted by the composer. */
  maxConversationInputLength: askLimits.maxAskUserMessageLength,
  genericError: "Unable to finish the answer. Please try again.",
  protocolFailureDetail: "The answer service returned a response the chat could not read.",
  connectionFailureDetail: "The connection to the answer service failed.",
  timeoutFailureDetail: "The answer service did not respond within 65 seconds.",
  serviceFailureDetail: "The answer service reported a failure while generating this reply.",
  timeoutError: "The answer took too long. Please try again.",
  cancelledError: "The request was cancelled.",
  missingTurnError: "The selected conversation turn was not found.",
  invalidQuestionError: "The selected question is invalid.",
  oversizedQuestionError: "This question is too large to send. Please shorten it and try again.",
  httpFailures: {
    413: [
      "This conversation is too long. Start over and try again.",
      "The answer service rejected the request with HTTP 413 because the conversation was too large.",
    ],
    400: [
      "Please check your question and try again.",
      "The answer service rejected the request with HTTP 400 because it was invalid.",
    ],
    415: [
      "The question could not be sent. Please try again.",
      "The answer service rejected the request with HTTP 415 because its format was not accepted.",
    ],
    503: [
      "Answers are unavailable right now. Please try again later.",
      "The answer service returned HTTP 503 because live generation is unavailable.",
    ],
  },
} as const;
