/** Maximum conversation messages accepted by the question endpoint. */
export const maxAskMessages = 11;
/** Maximum UTF-16 length accepted for one user message. */
export const maxAskUserMessageLength = 12_000;
/** Maximum UTF-16 length accepted for one assistant message or generated answer. */
export const maxAskAssistantMessageLength = 8_000;
/** Maximum UTF-8 byte length accepted for one serialized question request. */
export const maxAskBodyBytes = 64 * 1_024;
/** Maximum UTF-8 byte length accepted for one complete provider JSON result. */
export const maxAskGeneratedJsonBytes = 128 * 1_024;
/** Maximum UTF-8 byte length accepted for one complete SSE response. */
export const maxAskStreamBytes = 512 * 1_024;
/** Maximum duration of the full server request lifecycle. */
export const askServerTimeoutMs = 60_000;
/** Maximum duration of the browser request lifecycle. */
export const askBrowserTimeoutMs = 65_000;
/** Maximum source references returned with one answer. */
export const maxAskSources = 6;
/** Maximum generated follow-up suggestions returned with one answer. */
export const maxAskFollowUps = 2;
/** Maximum Unicode code points in a short follow-up label. */
export const maxAskShortFollowUpLabelCodePoints = 24;
/** Maximum Unicode code points in a lone long follow-up label. */
export const maxAskLongFollowUpLabelCodePoints = 60;
/** Maximum UTF-16 length of a generated follow-up question. */
export const maxAskFollowUpQuestionLength = 1_000;
/** Maximum pathname or section identifier accepted as optional view context. */
export const maxAskContextValueLength = 200;
/** Maximum portfolio record slug length accepted as optional view context. */
export const maxAskRecordSlugLength = 100;

/** One bounded user or assistant message sent to the question endpoint. */
export interface AskMessage {
  role: "user" | "assistant";
  content: string;
}

/** A project or article visible when the visitor submitted a question. */
export interface AskContextRecord {
  kind: "project" | "article";
  slug: string;
}

/** Optional portfolio location associated with a question. */
export interface AskContext {
  pathname: string;
  sectionId?: string;
  record?: AskContextRecord;
}

/** Valid request body accepted by the question endpoint. */
export interface AskRequest {
  messages: AskMessage[];
  context?: AskContext;
}

/** A server-resolved portfolio source returned with a completed answer. */
export interface AskSource {
  id: string;
  title: string;
  href: string;
}

/** A generated continuation displayed as a label and submitted as a full question. */
export interface AskFollowUp {
  label: string;
  question: string;
}

/** Successful terminal metadata returned after all answer deltas. */
export interface AskCompletion {
  sources: AskSource[];
  followUps: AskFollowUp[];
}

/** Strict model result validated before a successful stream completion. */
export interface GeneratedAnswer {
  answer: string;
  sourceIds: string[];
  followUps: AskFollowUp[];
}
