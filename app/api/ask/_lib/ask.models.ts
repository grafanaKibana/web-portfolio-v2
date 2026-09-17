import type { AskCompletion, AskFollowUp, AskRequest, AskSource } from "@/lib/ask.contract";
import type { loadArticles } from "@/lib/content/articles/server";
import type { GitHubActivityResult, GitHubFetch } from "@/lib/content/github-activity.models";
import type { ResolvedProjectLink } from "@/lib/content/plugin-links.models";
import type { ProjectLink } from "@/lib/content/types";
import type { HomeContent, PortfolioProfile } from "@/lib/content/portfolio/validation";
import type { loadProjects } from "@/lib/content/projects/server";
import type { AskConfiguration } from "./ask.config";


/** Strict provider result validated before a successful stream completion. */
export interface GeneratedAnswer {
  answer: string;
  sourceIds: string[];
  followUps: AskFollowUp[];
}

/** Server-owned public evidence paired with its citation destination. */
export interface CorpusEntry extends AskSource {
  /** Curated evidence that changes only when its authored source changes. */
  text: string;
  /** Optional live evidence kept after the reusable prompt boundary. */
  liveText?: string;
}

/** Minimal provider chunk inspected before exposing answer text. */
export interface ProviderChunk {
  text: string;
  finishReason?: string;
  refusal?: unknown;
}

/** Structural corpus boundary shared by production and controlled content loaders. */
export interface AskCorpus {
  /**
   * Builds complete evidence for an active request.
   * @param signal - Request lifecycle cancellation signal.
   * @returns The server-owned source catalog.
   */
  build(signal: AbortSignal): Promise<CorpusEntry[]>;
}

/** Structural answer boundary whose state belongs to each stream invocation. */
export interface AskAnswer {
  /**
   * Streams decoded answer text and returns validated terminal metadata.
   * @param input - Validated conversation and context.
   * @param signal - Request lifecycle cancellation signal.
   * @param configuration - Immutable provider snapshot.
   * @returns Answer deltas followed by terminal sources and follow-ups.
   */
  stream(input: AskRequest, signal: AbortSignal, configuration: AskConfiguration): AsyncGenerator<string, AskCompletion>;
}

/** Raw provider operation receiving one validated configuration and source allowlist. */
export type ProviderSessionFactory = (input: AskRequest, signal: AbortSignal, configuration: AskConfiguration, sources: readonly CorpusEntry[]) => Promise<AsyncIterable<ProviderChunk>>;

/** Required request dependencies; controlled providers cannot bypass configuration validation. */
export interface AskDependencies {
  resolveConfiguration: () => AskConfiguration;
  answerService: AskAnswer;
}

/** Stateless answer service dependencies. */
export interface AskAnswerDependencies {
  corpusService: AskCorpus;
  createProviderSession?: ProviderSessionFactory;
}

/** Required content and optional integration seams for one corpus builder. */
export interface AskCorpusDependencies {
  githubFetch?: GitHubFetch;
  loadArticles?: typeof loadArticles;
  loadProjects?: typeof loadProjects;
  portfolio?: { home: HomeContent; profile: PortfolioProfile };
  loadGitHubActivity?: (username: string, fetcher: GitHubFetch) => Promise<GitHubActivityResult>;
  resolvePluginLinks?: (links: readonly ProjectLink[] | undefined) => Promise<readonly ResolvedProjectLink[]>;
}

/** Independently available optional website snapshots. */
export interface OptionalSnapshot {
  githubActivity: GitHubActivityResult | { available: false };
  projectLinkMetadata: { slug: string; links: readonly ResolvedProjectLink[] }[] | { available: false };
}
