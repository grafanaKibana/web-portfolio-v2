"use client";

import { clsx } from "clsx";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

import styles from "./home-editorial-row.module.scss";

interface HomeEditorialRowProps {
  actions: ReactNode;
  dataSlot: string;
  description: ReactNode;
  metadata: ReactNode;
  title: ReactNode;
}

/**
 * Renders the shared editorial layout for Home project and writing rows.
 *
 * @param actions - Links associated with the entry.
 * @param dataSlot - Route-owned identifier for the list item.
 * @param description - Summary displayed below the title.
 * @param metadata - Supporting publication or project details.
 * @param title - Entry heading.
 * @returns A semantic Home editorial row.
 */
export function HomeEditorialRow({ actions, dataSlot, description, metadata, title }: HomeEditorialRowProps) {
  /**
   * Follows the primary link while preserving text selection and other controls.
   *
   * @param event - Pointer click bubbling through the row.
   */
  function followRowLink(event: ReactMouseEvent<HTMLLIElement>) {
    if (event.defaultPrevented || !(event.target instanceof Element)
      || event.target.closest("a, button, input, label, select, summary, textarea")) return;
    const selection = document.getSelection();
    if (selection && !selection.isCollapsed) return;
    event.currentTarget.querySelector<HTMLAnchorElement>("a[data-row-link]")
      ?.dispatchEvent(new MouseEvent("click", event.nativeEvent));
  }

  return (
    <li className={clsx(styles.row, "border-t lg:first:border-t-0")} data-page-motion-row data-slot={dataSlot} onClick={followRowLink}>
      <article className={styles.body} data-slot="home-editorial-row">
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.description}>{description}</p>
        <div className={styles.metadata} data-slot="row-metadata">{metadata}</div>
        <div className={styles.actions} data-slot="project-actions">{actions}</div>
      </article>
    </li>
  );
}
