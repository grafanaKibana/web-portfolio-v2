import {
  maxAskAssistantMessageLength,
  maxAskBodyBytes,
  maxAskUserMessageLength,
  type AskRequest,
} from "@/lib/ask.contract";
import type { ConversationTurn } from "./use-conversation";

const maxHistoryPairs = 5;
const encoder = new TextEncoder();

/** Measures the exact UTF-8 size sent by fetch after JSON serialization.
 * @param request - Candidate request payload.
 * @returns Serialized UTF-8 byte length.
 */
function requestBytes(request: AskRequest): number {
  return encoder.encode(JSON.stringify(request)).byteLength;
}

/** Builds bounded history from completed exchanges preceding the selected turn.
 * @param turns - Ordered displayed transcript.
 * @param turnId - Selected current turn.
 * @returns At most five preceding complete pairs and the current question.
 * @throws When the selected turn is absent or its question violates composer limits.
 */
export function buildAskRequest(
  turns: readonly ConversationTurn[],
  turnId: string,
): AskRequest {
  const selectedIndex = turns.findIndex((turn) => turn.id === turnId);
  if (selectedIndex < 0) throw new Error("The selected conversation turn was not found.");

  const selected = turns[selectedIndex];
  if (!selected) throw new Error("The selected conversation turn was not found.");
  if (!selected.question.trim() || selected.question.length > maxAskUserMessageLength) {
    throw new Error("The selected question is invalid.");
  }
  const pairs = turns
    .slice(0, selectedIndex)
    .filter((turn) => turn.status === "complete"
      && turn.question.length <= maxAskUserMessageLength
      && turn.text.length <= maxAskAssistantMessageLength)
    .slice(-maxHistoryPairs)
    .map((turn) => [
      { role: "user" as const, content: turn.question },
      { role: "assistant" as const, content: turn.text },
    ]);

  for (;;) {
    const request: AskRequest = {
      messages: [...pairs.flat(), { role: "user", content: selected.question }],
      ...(selected.context ? { context: selected.context } : {}),
    };
    if (requestBytes(request) <= maxAskBodyBytes) return request;
    if (pairs.length === 0) {
      throw new Error("This question is too large to send. Please shorten it and try again.");
    }
    pairs.shift();
  }
}
