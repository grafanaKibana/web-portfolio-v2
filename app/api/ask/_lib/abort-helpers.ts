import "server-only";

/**
 * Reads one request chunk while allowing the whole-request deadline to stop a stalled body.
 *
 * @param reader - Request body reader.
 * @param signal - Combined request and deadline signal.
 * @returns The next body chunk.
 */
export async function readRequestChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    /** Rejects the pending body read when its request lifecycle ends. */
    const abort = () => {
      void reader.cancel(signal.reason).catch(() => undefined);
      reject(abortReason(signal));
    };
    signal.addEventListener("abort", abort, { once: true });
    void reader.read().then(
      (result) => {
        signal.removeEventListener("abort", abort);
        resolve(result);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error instanceof Error ? error : new Error("Request body read failed"));
      },
    );
  });
}

/**
 * Normalizes an AbortSignal reason to an Error for rejected promises.
 *
 * @param signal - Aborted lifecycle signal.
 * @returns Its Error reason or a generic AbortError.
 */
export function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("Operation aborted", "AbortError");
}

/**
 * Stops waiting for a non-cancellable repository operation when the request lifecycle ends.
 *
 * @param promise - Required content operation.
 * @param signal - Request lifecycle cancellation signal.
 * @typeParam T - Required content result type.
 * @returns The operation value while the request remains active.
 */
export async function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    /** Stops waiting for required content after request cancellation. */
    const abort = () => {
      reject(abortReason(signal));
    };
    signal.addEventListener("abort", abort, { once: true });
    void promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error instanceof Error ? error : new Error("Portfolio content loading failed"));
      },
    );
  });
}
