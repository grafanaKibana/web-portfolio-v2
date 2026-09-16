import assert from "node:assert/strict";
import test from "node:test";

import {
  maxAskAssistantMessageLength,
  maxAskBodyBytes,
  maxAskMessages,
  maxAskUserMessageLength,
  type AskContext,
} from "@/lib/ask.contract";
import { buildAskRequest } from "./conversation-history";
import type { ConversationTurn } from "./use-conversation";

const encoder = new TextEncoder();

/** Creates a conversation turn fixture.
 * @param id - Stable turn identifier.
 * @param question - User question shown by the turn.
 * @param text - Assistant text shown by the turn.
 * @param status - Current turn lifecycle state.
 * @returns A conversation turn fixture.
 */
function turn(
  id: string,
  question: string,
  text: string,
  status: ConversationTurn["status"] = "complete",
): ConversationTurn {
  return { id, question, status, text };
}

test("buildAskRequest sends only the current question when no history exists", () => {
  assert.deepEqual(buildAskRequest([turn("current", "Current question", "", "pending")], "current"), {
    messages: [{ content: "Current question", role: "user" }],
  });
});

test("buildAskRequest includes the five latest completed pairs", () => {
  const turns = Array.from({ length: 5 }, (_, index) =>
    turn(`turn-${String(index)}`, `Question ${String(index)}`, `Answer ${String(index)}`));
  turns.push(turn("current", "Current question", "", "pending"));

  const request = buildAskRequest(turns, "current");

  assert.equal(request.messages.length, maxAskMessages);
  assert.deepEqual(request.messages[0], { content: "Question 0", role: "user" });
  assert.deepEqual(request.messages.at(-1), { content: "Current question", role: "user" });
});

test("buildAskRequest evicts complete pairs older than the five-pair window", () => {
  const turns = Array.from({ length: 7 }, (_, index) =>
    turn(`turn-${String(index)}`, `Question ${String(index)}`, `Answer ${String(index)}`));
  turns.push(turn("current", "Current question", "", "pending"));

  const request = buildAskRequest(turns, "current");

  assert.equal(request.messages.length, maxAskMessages);
  assert.deepEqual(request.messages[0], { content: "Question 2", role: "user" });
  assert.equal(request.messages.some(({ content }) => content === "Question 0"), false);
});

test("buildAskRequest excludes stopped, failed, pending, and partial turns", () => {
  const turns = [
    turn("complete", "Keep", "Complete answer"),
    turn("stopped", "Stopped", "Partial answer", "stopped"),
    turn("error", "Failed", "Partial answer", "error"),
    turn("pending", "Pending", "Partial answer", "pending"),
    turn("current", "Current", "", "pending"),
  ];

  assert.deepEqual(buildAskRequest(turns, "current").messages, [
    { content: "Keep", role: "user" },
    { content: "Complete answer", role: "assistant" },
    { content: "Current", role: "user" },
  ]);
});

test("buildAskRequest retrying an older turn excludes its old answer and later turns", () => {
  const turns = [
    turn("first", "First", "First answer"),
    turn("retry", "Original question", "Failed partial", "error"),
    turn("later", "Later", "Later answer"),
  ];

  assert.deepEqual(buildAskRequest(turns, "retry").messages, [
    { content: "First", role: "user" },
    { content: "First answer", role: "assistant" },
    { content: "Original question", role: "user" },
  ]);
});

test("buildAskRequest retains a complete maximum-length answer", () => {
  const displayed = `${"a".repeat(maxAskAssistantMessageLength - 2)}🙂`;
  const source = turn("history", "Earlier", displayed);
  const request = buildAskRequest([source, turn("current", "Current", "", "pending")], "current");
  const replay = request.messages[1]?.content;

  assert.ok(replay);
  assert.equal(replay, displayed);
  assert.equal(replay.length, maxAskAssistantMessageLength);
  assert.equal(source.text, displayed);
});

test("buildAskRequest retains the selected turn's original context snapshot", () => {
  const context: AskContext = {
    pathname: "/projects/fixture-project",
    record: { kind: "project", slug: "fixture-project" },
  };
  const selected = { ...turn("current", "Current", "", "pending"), context };

  assert.deepEqual(buildAskRequest([selected], "current"), {
    context,
    messages: [{ content: "Current", role: "user" }],
  });
});

test("buildAskRequest accepts the maximum current question without trimming it", () => {
  const question = "q".repeat(maxAskUserMessageLength);

  assert.equal(
    buildAskRequest([turn("current", question, "", "pending")], "current").messages[0]?.content,
    question,
  );
});

test("buildAskRequest evicts oldest whole pairs to satisfy the UTF-8 body cap", () => {
  const answer = "界🙂".repeat(2_000);
  const turns = Array.from({ length: 5 }, (_, index) =>
    turn(`turn-${String(index)}`, `问题${String(index)}`.repeat(70), answer));
  turns.push(turn("current", "当前问题", "", "pending"));

  const request = buildAskRequest(turns, "current");
  const bytes = encoder.encode(JSON.stringify(request)).byteLength;

  assert.ok(bytes <= maxAskBodyBytes, `${String(bytes)} exceeds ${String(maxAskBodyBytes)}`);
  assert.equal(request.messages.length % 2, 1);
  assert.equal(request.messages.at(-1)?.content, "当前问题");
  for (let index = 0; index < request.messages.length - 1; index += 2) {
    assert.equal(request.messages[index]?.role, "user");
    assert.equal(request.messages[index + 1]?.role, "assistant");
  }
});
