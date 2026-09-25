import "server-only";

import { ChatOpenAI } from "@langchain/openai";
import { AIMessage, HumanMessage, SystemMessage, type AIMessageChunk } from "@langchain/core/messages";
import type { AskCompletion, AskFollowUp, AskRequest } from "@/lib/ask.contract";
import { askLimits } from "@/lib/ask.config";
import { askServerConfig, type AskConfiguration } from "./ask.config";
import { AskGenerationError } from "./ask.errors";
import type { AskAnswerDependencies, CorpusEntry, GeneratedAnswer, ProviderChunk } from "./ask.models";
import { AskCorpusService } from "./ask-corpus.service";
import { AskPrompt } from "./ask.prompt";
import { extractPartialString, safeUnicodePrefix, topLevelKeys } from "./json-parsing";

const { maxAskAssistantMessageLength, maxAskSources, maxAskFollowUps, maxAskLongFollowUpLabelCodePoints, maxAskShortFollowUpLabelCodePoints, maxAskFollowUpQuestionLength } = askLimits;
const { maxAskGeneratedJsonBytes } = askServerConfig;

/** Streams validated answer text using stateless corpus and raw provider dependencies. */
export class AskAnswerService {
  /** Shared UTF-8 encoder; encoded data remains invocation-local. */
  private static readonly encoder = new TextEncoder();

  /**
   * Binds corpus and raw provider operations without retaining generation state.
   * @param dependencies - Corpus builder and optional controlled provider operation.
   */
  constructor(private readonly dependencies: AskAnswerDependencies) {}

  /**
   * Produces one live structured model result and yields only decoded answer text.
   *
   * @param input - Validated conversation and optional view hint.
   * @param signal - Shared request, response, and deadline cancellation signal.
   * @param configuration - Immutable provider snapshot resolved by the request owner.
   * @returns Validated sources and optional generated follow-ups.
   */
  async *stream(
    input: AskRequest,
    signal: AbortSignal,
    configuration: AskConfiguration,
  ): AsyncGenerator<string, AskCompletion> {
    const sources = await this.dependencies.corpusService.build(signal);
    signal.throwIfAborted();
    const chunks = await (this.dependencies.createProviderSession ?? AskAnswerService.createProviderSession)(input, signal, configuration, sources);
    let raw = "";
    let emitted = "";
    let finishReason: string | undefined;
    let refused = false;
    let terminalSeen = false;
    let rawBytes = 0;

    for await (const chunk of chunks) {
      signal.throwIfAborted();
      if (terminalSeen) throw new AskGenerationError("Provider returned data after terminal metadata");
      raw += chunk.text;
      rawBytes += AskAnswerService.encoder.encode(chunk.text).byteLength;
      if (rawBytes > maxAskGeneratedJsonBytes) {
        throw new AskGenerationError("Provider result exceeded its structural limit");
      }
      if (chunk.finishReason !== undefined) {
        finishReason = chunk.finishReason;
        terminalSeen = true;
      }
      if (chunk.refusal !== undefined && chunk.refusal !== null && chunk.refusal !== "") refused = true;
      const answer = this.parseJson(() => extractPartialString(raw, "answer"));
      if (answer === null) continue;
      if (!answer.startsWith(emitted) || answer.length > maxAskAssistantMessageLength) {
        throw new AskGenerationError("Provider answer stream was inconsistent");
      }
      const delta = answer.slice(emitted.length);
      emitted = answer;
      if (delta) yield delta;
    }

    if (finishReason !== "stop" || refused) {
      throw new AskGenerationError("Provider did not complete normally");
    }
    const generated = this.validateGeneratedAnswer(raw, emitted, sources);
    return {
      sources: generated.sourceIds.map((id) => {
        const source = sources.find((candidate) => candidate.id === id);
        if (!source) throw new AskGenerationError("Provider cited an unknown source");
        return { id: source.id, title: source.title, href: source.href };
      }),
      followUps: generated.followUps,
    };

  }

  /**
   * Translates only local parser failures into fixed safe generation diagnostics.
   * @param read - Generic JSON helper operation.
   * @typeParam T - Parsed helper result.
   * @returns The parsed value.
   * @throws A fixed generation error for recognized malformed JSON.
   */
  private parseJson<T>(read: () => T): T {
    try {
      return read();
    } catch (error) {
      if (error instanceof SyntaxError) {
        switch (error.message) {
          case "an invalid JSON escape": throw new AskGenerationError("Provider returned an invalid JSON escape");
          case "invalid JSON text": throw new AskGenerationError("Provider returned invalid JSON text");
          case "a malformed object key": throw new AskGenerationError("Provider returned a malformed object key");
          case "malformed nested JSON": throw new AskGenerationError("Provider returned malformed nested JSON");
          case "malformed JSON value": throw new AskGenerationError("Provider returned malformed JSON value");
        }
      }
      throw error;
    }
  }

  /**
   * Builds complete website context and starts the configured raw provider stream.
   *
   * @param input - Validated conversation and view hint.
   * @param signal - Request lifecycle cancellation signal.
   * @param configuration - Validated provider configuration.
   * @param sources - Complete public corpus allowlist.
   * @returns Raw provider chunks for strict result validation.
   */
  private static async createProviderSession(
    input: AskRequest,
    signal: AbortSignal,
    configuration: AskConfiguration,
    sources: readonly CorpusEntry[],
  ): Promise<AsyncIterable<ProviderChunk>> {
    signal.throwIfAborted();
    const sourceIds = sources.map(({ id }) => id);
    // Cache options are enabled only for the verified OpenAI endpoint and models.
    const explicitCache = configuration.baseUrl === askServerConfig.defaultApiBaseUrl
      && ["gpt-5.6-luna", "gpt-6-luna"].includes(configuration.model);
    // The installed LangChain model detector maps GPT-6 Luna to the unsupported max_tokens field.
    const explicitCompletionLimit = configuration.model === "gpt-6-luna";
    const model = new ChatOpenAI({
      apiKey: configuration.apiKey,
      configuration: { baseURL: configuration.baseUrl, maxRetries: 0, logLevel: "off" },
      maxRetries: 0,
      ...(explicitCompletionLimit ? {} : { maxTokens: configuration.maxCompletionTokens }),
      model: configuration.model,
      streamUsage: false,
      useResponsesApi: false,
      __includeRawResponse: true,
      modelKwargs: {
        ...(explicitCompletionLimit ? { max_completion_tokens: configuration.maxCompletionTokens } : {}),
        ...(explicitCache ? { prompt_cache_options: { mode: "explicit" } } : {}),
      },
    });
    const prompt = new AskPrompt().build(sources, AskCorpusService.resolveViewContext(input.context, sources));
    const messages = [
      new SystemMessage({
        content: explicitCache
          ? [{ type: "text", text: prompt.stable, prompt_cache_breakpoint: { mode: "explicit" } }]
          : prompt.stable,
      }),
      new SystemMessage(prompt.dynamic),
      ...input.messages.map(({ role, content }) => role === "user" ? new HumanMessage(content) : new AIMessage(content)),
    ];
    const responseFormat = {
      type: "json_schema" as const,
      json_schema: {
        name: "portfolio_answer",
        strict: true,
        schema: AskAnswerService.generatedAnswerSchema(sourceIds),
      },
    };
    const stream = await model.stream(messages, {
      maxRetries: 0,
      response_format: responseFormat,
      signal,
      tools: [],
    });

    return AskAnswerService.readProviderChunks(stream);
  }

  /**
   * Converts LangChain chunks into the minimal raw provider contract used by validation.
   *
   * @param stream - Raw ChatOpenAI stream.
   */
  private static async *readProviderChunks(
    stream: AsyncIterable<AIMessageChunk>,
  ): AsyncGenerator<ProviderChunk> {
    for await (const chunk of stream) {
      if (typeof chunk.content !== "string") throw new AskGenerationError("Provider returned unsupported content");
      const metadata = chunk.response_metadata;
      const raw = chunk.additional_kwargs.__raw_response;
      const refusal = raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as { choices?: { delta?: { refusal?: unknown } }[] }).choices?.[0]?.delta?.refusal
        : undefined;
      yield {
        text: chunk.content,
        ...(typeof metadata.finish_reason === "string" ? { finishReason: metadata.finish_reason } : {}),
        ...(refusal !== undefined ? { refusal } : {}),
      };
    }
  }

  /**
   * Creates the strict JSON Schema sent to the configured provider.
   *
   * @param sourceIds - Complete source ID allowlist for this request.
   * @returns A provider-compatible schema with every field required.
   */
  private static generatedAnswerSchema(sourceIds: readonly string[]): Record<string, unknown> {
    return {
      type: "object",
      additionalProperties: false,
      required: ["answer", "sourceIds", "followUps"],
      properties: {
        answer: { type: "string", minLength: 1, maxLength: maxAskAssistantMessageLength },
        sourceIds: {
          type: "array",
          maxItems: maxAskSources,
          items: { type: "string", enum: sourceIds },
        },
        followUps: {
          type: "array",
          maxItems: maxAskFollowUps,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["label", "question"],
            properties: {
              label: { type: "string", minLength: 1, maxLength: maxAskLongFollowUpLabelCodePoints },
              question: { type: "string", minLength: 1, maxLength: maxAskFollowUpQuestionLength },
            },
          },
        },
      },
    };
  }

  /**
   * Validates the final strict-schema result and normalizes only malformed optional follow-ups.
   *
   * @param raw - Complete raw provider JSON.
   * @param streamedAnswer - Exact answer prefix already exposed through SSE.
   * @param sources - Source allowlist supplied to the model.
   * @returns Canonical generated answer.
   * @throws When required answer or source fields are invalid or ambiguous.
   */
  private validateGeneratedAnswer(
    raw: string,
    streamedAnswer: string,
    sources: readonly CorpusEntry[],
  ): GeneratedAnswer {
    const keys = this.parseJson(() => topLevelKeys(raw));
    if (keys.length !== 3 || new Set(keys).size !== keys.length
      || !["answer", "sourceIds", "followUps"].every((key) => keys.includes(key))) {
      throw new AskGenerationError("Provider returned invalid top-level fields");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      throw new AskGenerationError("Provider returned malformed JSON");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new AskGenerationError("Provider returned an invalid result");
    }
    const result = parsed as Record<string, unknown>;
    if (typeof result.answer !== "string" || !result.answer.trim()
      || safeUnicodePrefix(result.answer) !== result.answer
      || result.answer.length > maxAskAssistantMessageLength || result.answer !== streamedAnswer) {
      throw new AskGenerationError("Provider returned an invalid answer");
    }
    const knownIds = new Set(sources.map(({ id }) => id));
    if (!Array.isArray(result.sourceIds) || result.sourceIds.length > maxAskSources
      || result.sourceIds.some((id) => typeof id !== "string" || !knownIds.has(id))
      || new Set(result.sourceIds).size !== result.sourceIds.length) {
      throw new AskGenerationError("Provider returned invalid sources");
    }
    this.validateCitationMarkers(result.answer, result.sourceIds.length);
    return {
      answer: result.answer,
      sourceIds: result.sourceIds as string[],
      followUps: this.validateFollowUps(result.followUps),
    };
  }

  /**
   * Validates each inline marker against the ordered sources without requiring every source to be used.
   *
   * @param answer - Validated generated answer text.
   * @param sourceCount - Number of ordered source IDs returned with the answer.
   * @throws When a marker is out of range or embedded in unsupported Markdown.
   */
  private validateCitationMarkers(answer: string, sourceCount: number): void {
    if (this.hasUnsupportedCitationSyntax(answer)) {
      throw new AskGenerationError("Provider embedded a citation in unsupported Markdown");
    }
    for (const match of answer.matchAll(/\[(\d+)\]/gu)) {
      const index = Number(match[1]);
      if (!Number.isSafeInteger(index) || match[1] !== String(index) || index < 1 || index > sourceCount) {
        throw new AskGenerationError("Provider returned an invalid citation marker");
      }
    }
  }

  /**
   * Rejects authored links, references, images, or code while allowing adjacent numeric citations.
   *
   * @param answer - Generated Markdown answer.
   * @returns Whether unsupported Markdown owns a numeric citation marker.
   */
  private hasUnsupportedCitationSyntax(answer: string): boolean {
    if (!/\[\d+\]/u.test(answer)) return false;
    if (answer.includes("`") || /~{3}|<!--|<[^>]*>/u.test(answer)) return true;
    if (/^[ \t]{0,3}\[\d+\]:|^(?: {4}|\t).*\[\d+\]/mu.test(answer)) return true;
    return [
      /!?\[[^\]\n]*\[\d+\][^\]\n]*\]\([^\)\n]*\)/u,
      /!?\[\d+\]\([^\)\n]*\)/u,
      /!?\[[^\]\n]*\]\([^\)\n]*\[\d+\][^\)\n]*\)/u,
      /!?\[[^\]\n]*\[\d+\][^\]\n]*\]\[[^\]\n]*\]/u,
      /!\[\d+\]\[[^\]\n]*\]/u,
      /\[\d+\]\[(?!\d+\])[^\]\n]*\]/u,
    ].some((pattern) => pattern.test(answer));
  }

  /**
   * Validates structural follow-up rules and degrades the entire optional field on failure.
   *
   * @param value - Untrusted follow-up field from an otherwise valid result.
   * @returns Trimmed suggestions or an empty array.
   */
  private validateFollowUps(value: unknown): AskFollowUp[] {
    if (!Array.isArray(value) || value.length > maxAskFollowUps) return [];
    const followUps: AskFollowUp[] = [];
    for (const item of value) {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const record = item as Record<string, unknown>;
      if (Object.keys(record).some((key) => key !== "label" && key !== "question")) return [];
      const { label, question } = record;
      if (typeof label !== "string" || typeof question !== "string") return [];
      const normalized = { label: label.trim(), question: question.trim() };
      const codePoints = Array.from(normalized.label).length;
      if (!normalized.label || !normalized.question
        || codePoints > maxAskLongFollowUpLabelCodePoints
        || normalized.question.length > maxAskFollowUpQuestionLength) return [];
      followUps.push(normalized);
    }
    if (followUps.length === 2
      && followUps.some(({ label }) => Array.from(label).length > maxAskShortFollowUpLabelCodePoints)) return [];
    if (new Set(followUps.map(({ label, question }) => `${label}\u0000${question}`)).size !== followUps.length) return [];
    return followUps;
  }
}
