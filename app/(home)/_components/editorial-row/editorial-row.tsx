"use client";

import { clsx } from "clsx";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { Subheading } from "../subheading";

import styles from "./editorial-row.module.scss";

interface HomeEditorialRowProps {
  actions: ReactNode;
  askRecord: { kind: "project" | "article"; slug: string };
  dataSlot: string;
  description: ReactNode;
  metadata: ReactNode;
  title: ReactNode;
}

/**
 * Renders the shared editorial layout for Home project and writing rows.
 *
 * @param actions - Links associated with the entry.
 * @param askRecord - Stable portfolio record identity exposed for page context.
 * @param dataSlot - Route-owned identifier for the list item.
 * @param description - Summary displayed below the title.
 * @param metadata - Supporting publication or project details.
 * @param title - Entry heading.
 * @returns A semantic Home editorial row.
 */
export function HomeEditorialRow({ actions, askRecord, dataSlot, description, metadata, title }: HomeEditorialRowProps) {
  /**
   * Follows the primary link outside the action row while preserving text selection and other controls.
   *
   * @param event - Pointer click bubbling through the row.
   */
  function followRowLink(event: ReactMouseEvent<HTMLLIElement>) {
    if (event.defaultPrevented || !(event.target instanceof Element)
      || event.target.closest('[data-slot="project-actions"], a, button, input, label, select, summary, textarea')) return;
    const selection = document.getSelection();
    if (selection && !selection.isCollapsed) return;
    event.currentTarget.querySelector<HTMLAnchorElement>("a[data-row-link]")
      ?.dispatchEvent(new MouseEvent("click", event.nativeEvent));
  }

  return (
    <li
      className={clsx(styles.row, "border-t lg:first:border-t-0")}
      data-ask-record-kind={askRecord.kind}
      data-ask-record-slug={askRecord.slug}
      data-page-motion-row
      data-slot={dataSlot}
      onClick={followRowLink}
    >
      <article className={styles.body} data-slot="home-editorial-row">
        <Subheading className={styles.title}>{title}</Subheading>
        <p className={styles.description}>{description}</p>
        <div className={styles.metadata} data-slot="row-metadata">{metadata}</div>
        <div className={clsx(styles.actions, "cursor-default [&_a]:cursor-pointer")} data-slot="project-actions">{actions}</div>
      </article>
    </li>
  );
}
