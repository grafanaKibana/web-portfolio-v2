"use client";

import { clsx } from "clsx";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

import styles from "./editorial-row.module.scss";

interface HomeEditorialRowProps {
  actions: ReactNode;
  askRecord: { kind: "project" | "article"; slug: string };
  dataSlot: string;
  description: ReactNode;
  metadata?: ReactNode;
  title: ReactNode;
}

/**
 * Renders the shared editorial layout for Home project and writing rows.
 *
 * @param actions - Links associated with the entry.
 * @param askRecord - Stable portfolio record identity exposed for page context.
 * @param dataSlot - Route-owned identifier for the list item.
 * @param description - Summary displayed below the title.
 * @param metadata - Optional publication metadata beneath the title.
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
      className={clsx(styles.row, "group/editorial has-[[data-row-link]]:cursor-pointer border-t py-4 first:border-t-0 first:pt-0 lg:py-6 lg:first:pt-0")}
      data-ask-record-kind={askRecord.kind}
      data-ask-record-slug={askRecord.slug}
      data-page-motion-row
      data-slot={dataSlot}
      onClick={followRowLink}
    >
      <article className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 lg:gap-x-6" data-slot="home-editorial-row">
        <h3 className="col-start-1 row-start-1 m-0 min-w-0 text-xl leading-7 font-medium tracking-[-0.02em] text-balance wrap-anywhere">{title}</h3>
        {metadata && <div className="col-span-2 row-start-2 mt-2 font-mono text-xs leading-4.5 text-muted-foreground">{metadata}</div>}
        <p className={clsx("col-span-2 m-0 mt-3 text-sm leading-6 text-pretty text-content-foreground", metadata ? "row-start-3" : "row-start-2")}>{description}</p>
        <div className="col-start-2 row-start-1 flex cursor-default items-start justify-end [&_a]:min-h-7 [&_a]:min-w-7 [&_a]:cursor-pointer [&_a]:justify-end" data-slot="project-actions">{actions}</div>
      </article>
    </li>
  );
}
