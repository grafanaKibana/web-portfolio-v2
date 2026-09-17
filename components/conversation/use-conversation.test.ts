import assert from "node:assert/strict";
import test from "node:test";

import { conversationConfig } from "./conversation.config";

const { maxConversationInputLength } = conversationConfig;

test("the conversation input limit supports pasted role descriptions", () => {
  assert.equal(maxConversationInputLength, 12_000);
});
