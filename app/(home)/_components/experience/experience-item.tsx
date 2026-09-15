"use client";

import { useLayoutEffect, useRef, type MouseEvent, type ReactNode } from "react";

interface ExperienceItemProps {
  children: ReactNode;
  className: string;
}

/**
 * Adds row-wide pointer toggling without overriding selection or native controls.
 *
 * @param children - Server-rendered timeline item content.
 * @param className - Timeline item presentation class.
 * @returns An interactive experience list item.
 */
export function ExperienceItem({ children, className }: ExperienceItemProps) {
  const itemRef = useRef<HTMLLIElement>(null);

  useLayoutEffect(() => {
    const item = itemRef.current;
    const timeline = item?.parentElement;
    if (!timeline || timeline.firstElementChild !== item) return;

    /** Measures the rail so the arrow travels exactly from its bottom to its top. */
    function measureFlight() {
      if (!timeline) return;
      const rail = getComputedStyle(timeline, "::before");
      const distance = timeline.getBoundingClientRect().height - parseFloat(rail.top) - parseFloat(rail.bottom);
      timeline.style.setProperty("--timeline-flight-distance", `${String(distance)}px`);
    }

    measureFlight();
    const observer = new ResizeObserver(measureFlight);
    observer.observe(timeline);
    timeline.dataset.timelineReady = "true";
    return () => {
      observer.disconnect();
      delete timeline.dataset.timelineReady;
      timeline.style.removeProperty("--timeline-flight-distance");
    };
  }, []);

  /**
   * Toggles the row disclosure unless the click belongs to selection or a native control.
   *
   * @param event - Click bubbling through the experience row.
   */
  function toggleHighlights(event: MouseEvent<HTMLLIElement>) {
    if (!(event.target instanceof Element) || event.target.closest("a, button, input, label, select, summary, textarea")) return;
    const selection = document.getSelection();
    if (selection && !selection.isCollapsed) return;
    const details = event.currentTarget.querySelector("details");
    if (details) details.open = !details.open;
  }

  return <li ref={itemRef} className={className} data-page-motion-row onClick={toggleHighlights}>{children}</li>;
}
