"use client";

import type { MouseEvent, ReactNode } from "react";

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

  return <li className={className} data-page-motion-row onClick={toggleHighlights}>{children}</li>;
}
