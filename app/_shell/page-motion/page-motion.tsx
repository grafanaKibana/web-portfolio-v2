"use client";

import { useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  animateMini as animate,
  inView,
  stagger,
  useReducedMotion,
  type AnimationPlaybackControlsWithThen,
} from "motion/react";

const INTRO_SELECTOR = "[data-page-motion-intro]";
const ITEM_SELECTOR = "[data-page-motion-item]";
const LEAD_SELECTOR = "[data-page-motion-lead]";
const ROW_SELECTOR = "[data-page-motion-row]";
const SECTION_SELECTOR = "[data-page-motion-section]";
const TRIGGER_SELECTOR = "[data-page-motion-trigger]";
const EASE = [0.22, 1, 0.36, 1] as const;
const VIEWPORT_MARGIN = "0px 0px -10% 0px" as const;

let latestGeneration = 0;

/**
 * Records the current pathname and reports whether it changed after mount.
 *
 * @param previousPathname - Mutable pathname observed by the committed effect.
 * @param pathname - Current application pathname.
 * @returns Whether a previous render observed another pathname.
 */
function recordRouteChange(previousPathname: { current: string | undefined }, pathname: string) {
  const routeChanged = previousPathname.current !== undefined && previousPathname.current !== pathname;
  previousPathname.current = pathname;
  return routeChanged;
}

type RowGroup = {
  control: AnimationPlaybackControlsWithThen | undefined;
  disconnect: VoidFunction | undefined;
  fullyVisible: boolean;
  ownsInlineStyles: boolean;
  queued: boolean;
  revealed: boolean;
  root: HTMLElement;
  staggerTargets: boolean;
  targets: HTMLElement[];
  trigger: HTMLElement;
};

type SectionRecord = {
  groups: RowGroup[];
  ownsRevealedMarker: boolean;
  root: HTMLElement;
};

type QueuedReveal = {
  group: RowGroup;
  record: SectionRecord;
};

/**
 * Clears animation styles owned by the page motion controller.
 *
 * @param element - Page element whose controller-owned styles are cleared.
 */
function clearMotionStyles(element: HTMLElement) {
  element.style.removeProperty("opacity");
  element.style.removeProperty("transform");
  element.style.removeProperty("will-change");
}

/**
 * Marks an element as controller-owned and ready for its entrance.
 *
 * @param element - Page element prepared for animation.
 * @param reducedMotion - Whether preparation must omit translation.
 */
function concealForMotion(element: HTMLElement, reducedMotion: boolean) {
  element.style.opacity = "0";
  element.style.willChange = reducedMotion ? "opacity" : "opacity, transform";
  if (!reducedMotion) element.style.transform = "translateY(18px)";
}

/**
 * Resolves the route-owned row groups animated within one stable section root.
 *
 * @param root - Marked section root declaring explicit or direct-child rows.
 * @returns Ordered groups that reveal from their own visible trigger.
 */
function resolveSectionGroups(root: HTMLElement) {
  if (root.dataset.pageMotionRows !== "children") {
    return Array.from(root.querySelectorAll<HTMLElement>(ROW_SELECTOR), (row) =>
      createRowGroup(resolveRowTargets(row), row, row, true));
  }

  const targets = Array.from(root.children).filter((element): element is HTMLElement => element instanceof HTMLElement);
  const groups: RowGroup[] = [];
  let current: HTMLElement[] = [];
  for (const target of targets) {
    if (/^H[2-6]$/.test(target.tagName) && current.length > 0) {
      const groupTrigger = current.at(0);
      if (groupTrigger) groups.push(createRowGroup(current, groupTrigger, groupTrigger, false));
      current = [];
    }
    current.push(target);
  }
  const groupTrigger = current.at(0);
  if (groupTrigger) groups.push(createRowGroup(current, groupTrigger, groupTrigger, false));
  return groups;
}

/**
 * Orders row items from the visual center toward both edges.
 *
 * @param targets - Items in document order.
 * @returns Items ordered for a center-out stagger.
 */
function orderFromCenter(targets: HTMLElement[]) {
  const ordered: HTMLElement[] = [];
  let left = Math.floor((targets.length - 1) / 2), right = left + 1;
  while (left >= 0 || right < targets.length) {
    if (left >= 0) ordered.push(targets[left--] as HTMLElement);
    if (right < targets.length) ordered.push(targets[right++] as HTMLElement);
  }
  return ordered;
}

/**
 * Resolves one row's stagger targets, falling back to the row itself.
 *
 * @param row - Route-owned viewport row.
 * @returns Ordered elements animated by the row's observer.
 */
function resolveRowTargets(row: HTMLElement) {
  const items = Array.from(row.querySelectorAll<HTMLElement>(ITEM_SELECTOR));
  if (items.length === 0) return [row];
  const lead = row.querySelector<HTMLElement>(LEAD_SELECTOR);
  const ordered = row.dataset.pageMotionOrder === "center-out" ? orderFromCenter(items) : items;
  return lead ? [lead, ...ordered] : ordered;
}

/**
 * Creates mutable controller state for one ordered row group.
 *
 * @param targets - Rows revealed together.
 * @param trigger - Visible element that activates the group.
 * @param root - Route-owned root containing the group.
 * @param staggerTargets - Whether targets within the group reveal sequentially.
 * @returns Fresh row group state.
 */
function createRowGroup(targets: HTMLElement[], trigger: HTMLElement, root: HTMLElement, staggerTargets: boolean): RowGroup {
  return {
    control: undefined,
    disconnect: undefined,
    fullyVisible: false,
    ownsInlineStyles: false,
    queued: false,
    revealed: false,
    root,
    staggerTargets,
    targets,
    trigger,
  };
}

/**
 * Clears controller-owned styles from every row in one group.
 *
 * @param group - Row group that becomes fully visible.
 */
function clearGroupStyles(group: RowGroup) {
  for (const target of group.targets) clearMotionStyles(target);
  group.ownsInlineStyles = false;
  group.fullyVisible = true;
}

/**
 * Reveals one frame's queued groups in document order.
 *
 * @param queue - Mutable queue collected before the animation frame.
 * @param reveal - Group reveal callback receiving its cumulative delay.
 */
function flushRevealQueue(queue: QueuedReveal[], reveal: (record: SectionRecord, group: RowGroup, startDelay: number) => void) {
  const groups = queue.splice(0).sort((left, right) => {
    if (left.group.trigger === right.group.trigger) return 0;
    return left.group.trigger.compareDocumentPosition(right.group.trigger) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });
  let startDelay = 0;
  for (const { group, record } of groups) {
    group.queued = false;
    if (group.revealed) continue;
    reveal(record, group, startDelay);
    startDelay += 0.075;
  }
}

/**
 * Finds the route-owned group containing a descendant element.
 *
 * @param element - Descendant element within a marked section.
 * @param records - Section records owned by the current controller.
 * @returns The matching section and row group, when present.
 */
function findElementGroup(element: HTMLElement, records: SectionRecord[]) {
  const root = element.closest<HTMLElement>(SECTION_SELECTOR);
  const record = records.find((candidate) => candidate.root === root);
  const group = record?.groups.find((candidate) => candidate.root.contains(element)
    || candidate.targets.some((item) => item.contains(element)));
  return record && group ? { group, record } : undefined;
}

/**
 * Finds the row group containing a same-page fragment target.
 *
 * @param fragment - Raw fragment beginning with a hash.
 * @param main - Current route's main landmark.
 * @param records - Section records owned by the current controller.
 * @returns The matching section and row group, when present.
 */
function findFragmentGroup(fragment: string, main: HTMLElement, records: SectionRecord[]) {
  if (!fragment.startsWith("#") || fragment.length < 2) return undefined;
  let id: string;
  try {
    id = decodeURIComponent(fragment.slice(1));
  } catch {
    return undefined;
  }
  const target = document.getElementById(id);
  if (!target || !main.contains(target)) return undefined;
  const record = records.find((candidate) => candidate.root === target.closest<HTMLElement>(SECTION_SELECTOR));
  if (!record) return undefined;
  const group = target === record.root
    ? record.groups.at(0)
    : record.groups.find((candidate) => candidate.root.contains(target)
      || candidate.targets.some((item) => item === target || item.contains(target)));
  return group ? { group, record } : undefined;
}

/**
 * Coordinates post-splash introductions and one-time page section reveals.
 *
 * @returns No markup; behavior attaches to server-rendered semantic markers.
 */
export function PageMotion() {
  const pathname = usePathname(), reducedMotion = useReducedMotion() === true, previousPathname = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    const generation = ++latestGeneration;
    let active = true, started = false, ownsIntroStyles = false;
    const root = document.documentElement, routeChanged = recordRouteChange(previousPathname, pathname);
    const main = document.querySelector<HTMLElement>("main#main");
    const introTargets = main ? Array.from(main.querySelectorAll<HTMLElement>(INTRO_SELECTOR)) : [];
    const sectionRoots = main ? Array.from(main.querySelectorAll<HTMLElement>(SECTION_SELECTOR)) : [];
    const records: SectionRecord[] = [];
    let introControl: AnimationPlaybackControlsWithThen | undefined, revealFrame: number | undefined;
    const queuedReveals: QueuedReveal[] = [];
    let handleFocus: ((event: FocusEvent) => void) | undefined;

    /**
     * Reports whether this effect generation still owns the page.
     *
     * @returns Whether callbacks may still mutate controller-owned state.
     */
    const ownsPage = () => active && generation === latestGeneration;

    /**
     * Batches simultaneously visible rows so navigation lands as a cascade.
     *
     * @param record - Section state owning the row group.
     * @param group - Row group awaiting its shared reveal frame.
     */
    function queueReveal(record: SectionRecord, group: RowGroup) {
      if (!ownsPage() || group.queued || group.revealed) return;
      group.queued = true;
      queuedReveals.push({ group, record });
      revealFrame ??= requestAnimationFrame(() => {
        revealFrame = requestAnimationFrame(() => {
          revealFrame = undefined;
          flushRevealQueue(queuedReveals, revealGroup);
        });
      });
    }

    /** Clears every inline style currently owned by this controller. */
    function exposeOwnedContent() {
      if (ownsIntroStyles) {
        for (const target of introTargets) clearMotionStyles(target);
        ownsIntroStyles = false;
      }
      for (const record of records) {
        for (const group of record.groups) {
          if (group.ownsInlineStyles) clearGroupStyles(group);
          else group.fullyVisible = true;
        }
        if (record.ownsRevealedMarker) {
          delete record.root.dataset.pageMotionRevealed;
          record.ownsRevealedMarker = false;
        }
      }
    }

    /**
     * Invalidates this generation and removes every controller side effect.
     *
     * @param preservePreflight - Whether an unstarted Strict Mode cleanup leaves preflight to its replacement.
     */
    function failOpen(preservePreflight = false) {
      const ownsDom = active && generation === latestGeneration;
      active = false;
      if (ownsDom) latestGeneration += 1;
      if (main && handleFocus) main.removeEventListener("focusin", handleFocus);
      window.removeEventListener("opening-splash-complete", start);
      window.removeEventListener("hashchange", revealHashTarget);
      if (revealFrame !== undefined) cancelAnimationFrame(revealFrame);
      revealFrame = undefined;
      for (const { group } of queuedReveals.splice(0)) group.queued = false;
      for (const record of records) {
        for (const group of record.groups) {
          group.disconnect?.();
          group.control?.cancel();
          group.control = undefined;
        }
      }
      introControl?.cancel(); introControl = undefined;
      if (ownsDom) {
        exposeOwnedContent();
        if (!preservePreflight) delete root.dataset.pageMotionPending;
      }
    }

    /**
     * Finishes one row group synchronously so keyboard focus is never concealed.
     *
     * @param record - Section state owning the row group.
     * @param group - Row group that must become immediately visible.
     */
    function revealImmediately(record: SectionRecord, group: RowGroup) {
      if (!ownsPage() || group.fullyVisible) return;

      group.queued = false;
      group.revealed = true;
      group.disconnect?.();
      group.control?.cancel();
      group.control = undefined;
      if (group.ownsInlineStyles) clearGroupStyles(group);
      else group.fullyVisible = true;
      record.root.dataset.pageMotionRevealed = "true";
      record.ownsRevealedMarker = true;
    }

    /**
     * Exposes the marked section containing a same-page fragment target.
     *
     * @param fragment - Raw fragment beginning with a hash.
    */
    function revealFragment(fragment: string) {
      if (!ownsPage() || !main) return;
      const match = findFragmentGroup(fragment, main, records);
      if (started && match && !match.group.fullyVisible) queueReveal(match.record, match.group);
    }

    /** Exposes the marked section containing the current in-page hash target. */
    function revealHashTarget() {
      revealFragment(window.location.hash);
    }

    /**
     * Reveals one row group once its trigger enters the visible viewport area.
     *
     * @param record - Stable section owning the row group.
     * @param group - Row group claimed by its viewport observer.
     * @param startDelay - Delay shared with other rows entering in the same frame.
     */
    function revealGroup(record: SectionRecord, group: RowGroup, startDelay = 0) {
      if (!ownsPage() || group.revealed) return;

      group.queued = false;
      group.revealed = true;
      group.fullyVisible = false;
      group.ownsInlineStyles = true;
      record.root.dataset.pageMotionRevealed = "true"; record.ownsRevealedMarker = true;
      try {
        const control = reducedMotion
          ? animate(group.targets, { opacity: [0, 1] }, { duration: 0.12 })
          : animate(
              group.targets,
              { opacity: [0, 1], transform: ["translateY(18px)", "none"] },
              { delay: group.staggerTargets ? stagger(0.075, { startDelay }) : startDelay, duration: 0.52, ease: EASE },
            );
        group.control = control;

        void control.finished.then(() => {
          if (!ownsPage() || group.control !== control || !group.ownsInlineStyles) return;
          group.control = undefined;
          clearGroupStyles(group);
        }, () => undefined);
      } catch {
        failOpen();
      }
    }

    /** Arms Motion while preflight concealment still covers the page. */
    function start() {
      if (!ownsPage() || started) return;
      started = true;
      if (!routeChanged && root.dataset.pageMotionPending !== "true") {
        exposeOwnedContent();
        return;
      }

      try {
        for (const target of introTargets) concealForMotion(target, reducedMotion);
        ownsIntroStyles = introTargets.length > 0;
        for (const record of records) {
          for (const group of record.groups) {
            if (group.revealed) continue;
            for (const target of group.targets) concealForMotion(target, reducedMotion);
            group.ownsInlineStyles = true;
            group.disconnect = inView(
              group.trigger,
              () => {
                if (!ownsPage()) return;
                queueReveal(record, group);
              },
              { margin: VIEWPORT_MARGIN },
            );
          }
        }

        if (introTargets.length > 0) {
          introControl = reducedMotion
            ? animate(introTargets, { opacity: [0, 1] }, { duration: 0.12 })
            : animate(
                introTargets,
                { opacity: [0, 1], transform: ["translateY(18px)", "none"] },
                { delay: stagger(0.075, { startDelay: 0.04 }), duration: 0.52, ease: EASE },
              );
          const ownedIntroControl = introControl;
          void ownedIntroControl.finished.then(() => {
            if (!ownsPage() || introControl !== ownedIntroControl || !ownsIntroStyles) return;
            introControl = undefined;
            for (const target of introTargets) clearMotionStyles(target);
            ownsIntroStyles = false;
          }, () => undefined);
        }

        delete root.dataset.pageMotionPending;
      } catch {
        failOpen();
      }
    }

    try {
      if (!main) throw new Error("Page motion requires the main landmark.");
      if (introTargets.length === 0 && sectionRoots.length === 0) { delete root.dataset.pageMotionPending; return undefined; }

      for (const sectionRoot of sectionRoots) {
        const nestedTriggers = sectionRoot.querySelectorAll<HTMLElement>(TRIGGER_SELECTOR);
        const rootIsTrigger = sectionRoot.matches(TRIGGER_SELECTOR);
        if (nestedTriggers.length + Number(rootIsTrigger) !== 1) {
          throw new Error("A page section motion trigger is incomplete.");
        }
        const groups = resolveSectionGroups(sectionRoot);
        if (groups.length === 0) throw new Error("A page section has no motion rows.");
        records.push({
          groups,
          ownsRevealedMarker: false,
          root: sectionRoot,
        });
      }

      /**
       * Exposes a section before keyboard focus reaches concealed content.
       *
       * @param event - Delegated focus event from the main landmark.
       */
      handleFocus = (event: FocusEvent) => {
        if (!ownsPage() || !(event.target instanceof HTMLElement) || !event.target.matches(":focus-visible")) return;
        const match = findElementGroup(event.target, records);
        if (match && !match.group.fullyVisible) revealImmediately(match.record, match.group);
      };
      main.addEventListener("focusin", handleFocus);
      window.addEventListener("hashchange", revealHashTarget);
      revealHashTarget();

      if (document.activeElement instanceof HTMLElement && document.activeElement.matches(":focus-visible") && main.contains(document.activeElement)) {
        const match = findElementGroup(document.activeElement, records);
        if (match) revealImmediately(match.record, match.group);
      }

      window.addEventListener("opening-splash-complete", start);
      const debugSplash = new URLSearchParams(window.location.search).has("debugSplash");
      if (!debugSplash && root.dataset.splashComplete === "true") start();

      return () => { failOpen(!started); };
    } catch {
      failOpen();
      return undefined;
    }
  }, [pathname, reducedMotion]);

  return null;
}
