import assert from "node:assert/strict";
import test from "node:test";

import { maxConversationInputLength } from "./use-conversation";

test("the conversation input limit supports pasted role descriptions", () => {
  assert.equal(maxConversationInputLength, 12_000);
});
