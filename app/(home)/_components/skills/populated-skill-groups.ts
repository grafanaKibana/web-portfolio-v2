/** Skill group shape required for Home presentation filtering. */
export interface SkillGroupWithEntries {
  skills: readonly string[];
}

/**
 * Removes skill groups that have no entries.
 *
 * @typeParam T - Skill group type preserved by the filter.
 * @param groups - Validated skill groups in source order.
 * @returns Populated groups in their original order.
 */
export function populatedSkillGroups<T extends SkillGroupWithEntries>(groups: readonly T[]) {
  return groups.filter((group) => group.skills.length > 0);
}
