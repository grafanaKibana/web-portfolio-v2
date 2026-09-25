"use client";

import { clsx } from "clsx";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

import styles from "./editorial-row.module.scss";

interface HomeEditorialRowProps {
  actions: ReactNode;
  askRecord: { kind: "project" | "article"; slug: string };
  dataSlot: string;
  description: ReactNode;
  title: ReactNode;
}

/**
 * Renders the shared editorial layout for Home project and writing rows.
 *
 * @param actions - Links associated with the entry.
 * @param askRecord - Stable portfolio record identity exposed for page context.
 * @param dataSlot - Route-owned identifier for the list item.
 * @param description - Summary displayed below the title.
 * @param title - Entry heading.
 * @returns A semantic Home editorial row.
 */
export function HomeEditorialRow({ actions, askRecord, dataSlot, description, title }: HomeEditorialRowProps) {
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
      <article className="grid gap-x-4 md:grid-cols-[minmax(0,1fr)_auto] lg:gap-x-6" data-slot="home-editorial-row">
        <h3 className="m-0 min-w-0 text-[1.375rem] leading-7 font-medium tracking-[-0.02em] text-balance wrap-anywhere md:col-start-1 md:row-start-1 lg:group-first/editorial:text-2xl lg:group-first/editorial:leading-7.5">{title}</h3>
        <p className="m-0 mt-3 text-sm leading-6 text-pretty text-content-foreground md:col-span-2 md:row-start-2">{description}</p>
        <div className="mt-3 flex cursor-default flex-wrap items-center justify-start gap-x-2 gap-y-1 md:col-start-2 md:row-start-1 md:mt-0 md:justify-end lg:gap-x-6 [&_a]:cursor-pointer max-lg:[&_a]:min-h-11 max-lg:[&_a]:min-w-11 max-lg:[&_a]:justify-center [&_[data-row-link]]:ms-auto" data-slot="project-actions">{actions}</div>
      </article>
    </li>
  );
}
