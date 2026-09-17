/** Wire limits shared by Ask request and response producers and consumers. */
export const askLimits = {
  /** Maximum conversation messages accepted by the question endpoint. */
  maxAskMessages: 11,
  /** Maximum UTF-16 length accepted for one user message. */
  maxAskUserMessageLength: 12_000,
  /** Maximum UTF-16 length accepted for one assistant message or generated answer. */
  maxAskAssistantMessageLength: 8_000,
  /** Maximum UTF-8 byte length accepted for one serialized question request. */
  maxAskBodyBytes: 64 * 1_024,
  /** Maximum UTF-8 byte length accepted for one complete SSE response. */
  maxAskStreamBytes: 512 * 1_024,
  /** Maximum source references returned with one answer. */
  maxAskSources: 6,
  /** Maximum generated follow-up suggestions returned with one answer. */
  maxAskFollowUps: 2,
  /** Maximum Unicode code points in a short follow-up label. */
  maxAskShortFollowUpLabelCodePoints: 24,
  /** Maximum Unicode code points in a lone long follow-up label. */
  maxAskLongFollowUpLabelCodePoints: 60,
  /** Maximum UTF-16 length of a generated follow-up question. */
  maxAskFollowUpQuestionLength: 1_000,
  /** Maximum pathname or section identifier accepted as optional view context. */
  maxAskContextValueLength: 200,
  /** Maximum portfolio record slug length accepted as optional view context. */
  maxAskRecordSlugLength: 100,
} as const;
