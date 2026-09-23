/** Fade state for content hidden by vertical scrolling. */
export type CredentialEdgeFade = "none" | "start" | "end" | "both";

/**
 * Finds which scrollport edges still hide credentials.
 *
 * @param scrollTop - Current vertical scroll offset.
 * @param clientHeight - Visible scrollport height.
 * @param scrollHeight - Total scrollable content height.
 * @returns Fade and overflow state.
 */
export function credentialEdgeFade(scrollTop: number, clientHeight: number, scrollHeight: number) {
  const start = scrollTop > 1;
  const end = scrollTop + clientHeight < scrollHeight - 1;
  const fade: CredentialEdgeFade = start && end ? "both" : start ? "start" : end ? "end" : "none";
  return { fade, overflow: scrollHeight > clientHeight + 1 };
}
