import { useLayoutEffect, useRef, type RefObject } from "react";
import { cubicBezier, useReducedMotion } from "motion/react";

/** Shared duration for content growth and scroll coordination, in seconds. */
export const chatGrowthDuration = 0.28;
/** Shared easing for chat geometry and control entrances. */
export const chatMotionEase = [0.22, 1, 0.36, 1] as const;
/** Duration of one soft horizontal line reveal, in milliseconds. */
export const chatLineRevealDuration = 480;

const revealEase = cubicBezier(...chatMotionEase);
const feather = 36;

/** One actual visual line and its continuous horizontal reveal frontier. */
type RevealLine = { top: number; bottom: number; right: number; from: number; edge: number; started: number };

/** Measures rendered text rows without wrapping or replacing Markdown nodes.
 * @param element - Unmodified Markdown container.
 * @param characterLimit - Optional rendered prefix to measure after wrapping changes.
 * @returns Merged visual line rectangles relative to the container.
 */
function measureLines(element: HTMLElement, characterLimit = Infinity): Pick<RevealLine, "top" | "bottom" | "right">[] {
  const origin = element.getBoundingClientRect();
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  const rows: Pick<RevealLine, "top" | "bottom" | "right">[] = [];
  let node = walker.nextNode();
  while (node && characterLimit > 0) {
    const length = Math.min(characterLimit, node.textContent?.length ?? 0);
    if (node.textContent?.slice(0, length).trim()) {
      range.setStart(node, 0);
      range.setEnd(node, length);
      for (const rect of range.getClientRects()) {
        if (!rect.width || !rect.height) continue;
        const top = rect.top - origin.top;
        const bottom = rect.bottom - origin.top;
        const right = rect.right - origin.left;
        const row = rows.find((candidate) => Math.abs(candidate.top - top) < 3);
        if (row) {
          row.bottom = Math.max(row.bottom, bottom);
          row.right = Math.max(row.right, right);
        } else rows.push({ top, bottom, right });
      }
    }
    characterLimit -= length;
    node = walker.nextNode();
  }
  return rows.sort((left, right) => left.top - right.top);
}

/** Removes only the decorative line mask, leaving content immediately readable.
 * @param element - Answer whose reveal has settled or been interrupted.
 */
function clearLineMask(element: HTMLElement) {
  element.style.removeProperty("mask-image");
  element.style.removeProperty("mask-position");
  element.style.removeProperty("mask-size");
  element.style.removeProperty("mask-repeat");
  delete element.dataset.lineReveal;
}

/** Reveals appended content through soft horizontal masks for actual wrapped lines.
 * @param answerRef - Semantic answer container; its Markdown stays untouched.
 * @param text - Current answer source, used to distinguish append from replacement.
 * @param sources - Source metadata changes that can reflow completed citations.
 */
export function useConversationLineReveal(answerRef: RefObject<HTMLDivElement | null>, text: string, sources: unknown) {
  const reducedMotion = useReducedMotion();
  const previous = useRef({ text: "", renderedText: "", width: 0, height: 0, lines: [] as RevealLine[] });

  useLayoutEffect(() => {
    const element = answerRef.current;
    if (!element) return;
    let frame = 0;
    const forcedColors = window.matchMedia("(forced-colors: active)");

    /** Paints each line independently, keeping already revealed text fully opaque. */
    const paint = () => {
      const lines = previous.current.lines;
      const now = performance.now();
      let active = false;
      for (const line of lines) {
        const progress = Math.min(1, Math.max(0, (now - line.started) / chatLineRevealDuration));
        line.edge = line.from + (line.right + feather - line.from) * revealEase(progress);
        active ||= progress < 1 && line.edge < line.right + feather - 0.1;
      }
      if (!active) {
        clearLineMask(element);
        return;
      }
      element.dataset.lineReveal = "true";
      element.style.maskImage = lines.map(({ edge }) => `linear-gradient(to right, #000 ${String(edge - feather)}px, transparent ${String(edge)}px)`).join(", ");
      element.style.maskPosition = lines.map(({ top }) => `0px ${String(Math.floor(top) - 3)}px`).join(", ");
      element.style.maskSize = lines.map(({ top, bottom }) => `100% ${String(Math.ceil(bottom) - Math.floor(top) + 6)}px`).join(", ");
      element.style.maskRepeat = "no-repeat";
      frame = requestAnimationFrame(paint);
    };

    /** Retargets new text from its current frontier; reflow never replays old content.
     * @param append - Whether a content commit may introduce unseen text.
     */
    const measure = (append: boolean) => {
      cancelAnimationFrame(frame);
      const width = element.clientWidth;
      const height = element.clientHeight;
      const prior = previous.current;
      const renderedText = element.textContent;
      const animate = append && text.startsWith(prior.text) && renderedText.startsWith(prior.renderedText)
        && (prior.width === 0 || Math.abs(prior.width - width) < 1)
        && !reducedMotion && !window.matchMedia("(prefers-reduced-motion: reduce)").matches && !forcedColors.matches;
      const now = performance.now();
      const prefixRows = animate ? measureLines(element, prior.renderedText.length) : [];
      const lines = measureLines(element).map((row, index) => {
        const old = prior.lines[index];
        const target = row.right + feather;
        const sameRow = old && Math.abs(old.top - row.top) < 3;
        // A trailing word can move into a new row when a chunk extends it.
        const prefixRow = prefixRows.find((prefix) => Math.abs(prefix.top - row.top) < 3);
        const transferredEdge = prefixRow ? prefixRow.right + feather : 0;
        const edge = animate ? Math.min(target, sameRow ? old.edge : transferredEdge) : target;
        // Keep an active line's clock when its target has not changed.
        const unchanged = sameRow && Math.abs(old.right - row.right) < 0.5;
        return { ...row, edge, from: unchanged && animate ? old.from : edge, started: unchanged && animate ? old.started : now };
      });
      previous.current = { text, renderedText, width, height, lines };
      paint();
    };

    measure(true);
    const observer = new ResizeObserver(() => {
      if (element.clientWidth !== previous.current.width || element.clientHeight !== previous.current.height) measure(false);
    });
    observer.observe(element);
    /** Shows text immediately when high-contrast rendering disables decorative masks. */
    const onForcedColors = () => { measure(false); };
    forcedColors.addEventListener("change", onForcedColors);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      forcedColors.removeEventListener("change", onForcedColors);
      clearLineMask(element);
    };
  }, [answerRef, reducedMotion, sources, text]);
}
