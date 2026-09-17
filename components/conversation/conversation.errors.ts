import { conversationConfig } from "./conversation.config";

/** Carries public recovery guidance and a safe factual failure explanation. */
export class AskStreamError extends Error {
  readonly detail: string;

  /**
   * Creates a display-safe transport error.
   * @param message - Public recovery guidance.
   * @param detail - Public problem detail containing only client-observed facts.
   */
  constructor(message: string = conversationConfig.genericError, detail: string = conversationConfig.protocolFailureDetail) {
    super(message);
    this.name = "AskStreamError";
    this.detail = detail;
  }
}
