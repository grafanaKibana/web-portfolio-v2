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
