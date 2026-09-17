import type { AskCompletion, AskFollowUp, AskSource } from "@/lib/ask.contract";
import { askLimits } from "@/lib/ask.config";
import { AskStreamError } from "./conversation.errors";

const { maxAskFollowUpQuestionLength, maxAskFollowUps, maxAskLongFollowUpLabelCodePoints,
  maxAskShortFollowUpLabelCodePoints, maxAskSources } = askLimits;

/** Checks that parsed JSON has exactly the expected fields.
 * @param value - Parsed event payload.
 * @param keys - Required and permitted property names.
 * @returns Whether the payload has the exact shape.
 */
export function hasKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

/** Validates one same-site source resolved by the server.
 * @param value - Candidate source payload.
 * @returns Whether the source has a safe exact wire shape.
 */
function isSource(value: unknown): value is AskSource {
  if (!hasKeys(value, ["id", "title", "href"])) return false;
  const { href, id, title } = value;
  return typeof id === "string" && Boolean(id.trim()) && id.length <= 200
    && typeof title === "string" && Boolean(title.trim()) && title.length <= 200
    && typeof href === "string" && href.length <= 300
    && /^\/(?:$|#[a-z0-9-]+$|(?:projects|articles)(?:$|\/[a-z0-9]+(?:-[a-z0-9]+)*)$)/u.test(href);
}

/** Validates one generated follow-up action.
 * @param value - Candidate follow-up payload.
 * @returns Whether the suggestion has an exact bounded wire shape.
 */
function isFollowUp(value: unknown): value is AskFollowUp {
  if (!hasKeys(value, ["label", "question"])) return false;
  const { label, question } = value;
  return typeof label === "string" && label === label.trim() && Boolean(label)
    && Array.from(label).length <= maxAskLongFollowUpLabelCodePoints
    && typeof question === "string" && question === question.trim() && Boolean(question)
    && question.length <= maxAskFollowUpQuestionLength;
}

/** Validates terminal sources and follow-up combinations.
 * @param value - Candidate done payload.
 * @returns Valid terminal metadata, or undefined for an invalid payload.
 */
export function parseCompletion(value: unknown): AskCompletion | undefined {
  if (!hasKeys(value, ["sources", "followUps"])
    || !Array.isArray(value.sources) || value.sources.length > maxAskSources
    || !value.sources.every(isSource)
    || new Set(value.sources.map((source) => source.id)).size !== value.sources.length
    || !Array.isArray(value.followUps) || value.followUps.length > maxAskFollowUps
    || !value.followUps.every(isFollowUp)) return undefined;

  const followUps = value.followUps;
  if (followUps.length === 2
    && followUps.some(({ label }) => Array.from(label).length > maxAskShortFollowUpLabelCodePoints)) return undefined;
  if (new Set(followUps.map(({ label, question }) => `${label}\u0000${question}`)).size !== followUps.length) return undefined;
  return { sources: value.sources, followUps };
}

/** Parses one complete SSE frame into its event name and JSON payload.
 * @param frame - Complete SSE frame without its blank delimiter.
 * @returns A parsed event, or undefined for a comment-only frame.
 * @throws When the frame lacks a single event or valid JSON data field.
 */
export function parseFrame(frame: string): { event: string; data: unknown } | undefined {
  let event = "";
  const data: string[] = [];
  for (const line of frame.split(/\r?\n/u)) {
    if (line.startsWith(":")) continue;
    const separator = line.indexOf(":");
    const field = separator < 0 ? line : line.slice(0, separator);
    let value = separator < 0 ? "" : line.slice(separator + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") {
      if (event) throw new AskStreamError();
      event = value;
    } else if (field === "data") {
      data.push(value);
    }
  }
  if (!event && data.length === 0) return undefined;
  if (!event || data.length === 0) throw new AskStreamError();
  try {
    return { event, data: JSON.parse(data.join("\n")) as unknown };
  } catch {
    throw new AskStreamError();
  }
}
