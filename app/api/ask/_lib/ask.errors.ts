import "server-only";

/** Identifies service-owned validation failures whose fixed messages contain no provider or visitor data. */
export class AskGenerationError extends Error {}

/** Reports a public request or configuration error without exposing internal details. */
export class AskRequestError extends Error {
  /**
   * Creates an HTTP-mapped Ask error.
   *
   * @param status - Response status used before streaming begins.
   * @param message - Safe visitor-facing message.
   */
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}
