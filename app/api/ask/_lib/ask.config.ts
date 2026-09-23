import "server-only";

import { AskRequestError } from "./ask.errors";

/** Server-only limits for provider output and the full Ask request lifecycle. */
export const askServerConfig = {
  /** Maximum UTF-8 byte length accepted for one complete provider JSON result. */
  maxAskGeneratedJsonBytes: 128 * 1_024,
  /** Maximum duration of the full server request lifecycle. */
  askServerTimeoutMs: 60_000,
  defaultApiBaseUrl: "https://api.openai.com/v1",
  defaultModel: "gpt-6-luna",
  defaultMaxCompletionTokens: 8_192,
  maxCorpusBytes: 256 * 1_024,
  optionalDataTimeoutMs: 5_000,
} as const;

const { defaultApiBaseUrl, defaultModel, defaultMaxCompletionTokens } = askServerConfig;

/** Immutable provider configuration resolved once after request validation. */
export class AskConfiguration {
  /**
   * Creates a resolved provider snapshot.
   * @param apiKey - Server-only provider credential.
   * @param baseUrl - Validated provider endpoint.
   * @param model - Provider model identifier.
   * @param maxCompletionTokens - Validated completion token cap.
   */
  constructor(
    public readonly apiKey: string,
    public readonly baseUrl: string,
    public readonly model: string,
    public readonly maxCompletionTokens: number,
  ) {}

  /**
   * Reads and validates server-only provider configuration.
   *
   * @returns Safe configuration for one OpenAI-compatible Chat Completions request.
   * @throws A safe 503 error when operator configuration is missing or unsupported.
   */
  static fromEnvironment(): AskConfiguration {
    for (const name of [
      "LANGSMITH_TRACING",
      "LANGSMITH_TRACING_V2",
      "LANGCHAIN_TRACING",
      "LANGCHAIN_TRACING_V2",
      "LANGCHAIN_VERBOSE",
    ]) {
      if (/^(?:1|true)$/i.test(process.env[name]?.trim() ?? "")) {
        throw new AskRequestError(503, "Ask AI tracing must be disabled before this service can run.");
      }
    }
    const apiKey = process.env.ASK_API_KEY?.trim();
    const model = process.env.ASK_MODEL?.trim() || defaultModel;
    const baseUrlValue = process.env.ASK_API_BASE_URL?.trim() || defaultApiBaseUrl;
    const tokenValue = process.env.ASK_MAX_COMPLETION_TOKENS?.trim();
    const maxCompletionTokens = tokenValue === undefined || tokenValue === ""
      ? defaultMaxCompletionTokens
      : Number(tokenValue);
    let baseUrl: URL;
    try {
      baseUrl = new URL(baseUrlValue);
    } catch {
      throw new AskRequestError(503, "Ask AI provider configuration is invalid.");
    }
    if (!apiKey || !model || model.length > 100
      || !["http:", "https:"].includes(baseUrl.protocol)
      || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash
      || !Number.isSafeInteger(maxCompletionTokens)
      || maxCompletionTokens < 1 || maxCompletionTokens > 32_768) {
      throw new AskRequestError(503, "Ask AI provider configuration is missing or invalid.");
    }
    return new AskConfiguration(apiKey, baseUrl.toString().replace(/\/$/u, ""), model, maxCompletionTokens);
  }
}
