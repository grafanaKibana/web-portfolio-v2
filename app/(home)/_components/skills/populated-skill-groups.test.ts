import assert from "node:assert/strict";
import test from "node:test";

import { populatedSkillGroups } from "./populated-skill-groups";

test("skill groups omit empty entries without changing populated order", () => {
  const groups = [
    { title: "First", skills: ["One"] },
    { title: "Empty", skills: [] },
    { title: "Second", skills: ["Two", "Three"] },
  ] as const;

  assert.deepEqual(populatedSkillGroups(groups).map((group) => group.title), ["First", "Second"]);
});

test("skill groups return an empty collection when every group is empty", () => {
  assert.deepEqual(populatedSkillGroups([{ title: "Empty", skills: [] }]), []);
});
