"use client";

import { Dialog } from "@base-ui/react/dialog";
import { clsx } from "clsx";
import { ArrowLeft, Check, ChevronDown, House, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ThemeToggle } from "../theme/theme";
import styles from "./mobile-navigation.module.scss";
import headerStyles from "../site-header/site-header.module.scss";

interface NavigationItem {
  label: string;
  href: string;
}

interface MobileNavigationProps {
  backToTopLabel: string;
  closeLabel: string;
  compactNavigationLabel: string;
  defaultSectionLabel: string;
  detailRoutes: readonly {
    backHref: string;
    backLabel: string;
    homeLabel: string;
    navigationLabel: string;
    routePrefix: string;
  }[];
  items: readonly NavigationItem[];
  navigationLabel: string;
  primaryNavigationLabel: string;
  scrollThreshold: number;
  themeLabels: {
    change: string;
    switchToDark: string;
    switchToLight: string;
  };
  triggerLabel: string;
}

/**
 * Tracks the active section plus compact-selector visibility and modal state.
 *
 * @param items - Section anchors observed in the document.
 * @param scrollThreshold - Scroll offset that reveals the selector.
 * @param activeRouteHref - Section represented by a non-Home collection route.
 * @returns The current navigation state and modal setter.
 */
function useSectionNavigationState(
  items: readonly NavigationItem[],
  scrollThreshold: number,
  activeRouteHref?: string,
) {
  const [observedActiveLabel, setObservedActiveLabel] = useState<string>();
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (activeRouteHref) return;

    const sections = items
      .map((item) => document.getElementById(item.href.slice(1)))
      .filter((section): section is HTMLElement => section !== null);

    /** Updates selector visibility and the section at the sticky-header edge. */
    const updateNavigation = () => {
      const nextVisible = window.scrollY > scrollThreshold;
      setVisible(nextVisible);
      if (!nextVisible) setOpen(false);

      const headerBottom = document.querySelector<HTMLElement>('[data-slot="site-header"]')
        ?.getBoundingClientRect().bottom ?? 0;
      let reachedSection: HTMLElement | undefined;
      for (const section of sections) {
        if (section.getBoundingClientRect().top > headerBottom + 1) break;
        reachedSection = section;
      }
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1) {
        reachedSection = sections.at(-1);
      }

      const item = reachedSection
        ? items.find(({ href }) => href === `#${reachedSection.id}`)
        : undefined;
      setObservedActiveLabel(item?.label);
    };

    updateNavigation();
    window.addEventListener("resize", updateNavigation);
    window.addEventListener("scroll", updateNavigation, { passive: true });
    return () => {
      window.removeEventListener("resize", updateNavigation);
      window.removeEventListener("scroll", updateNavigation);
    };
  }, [activeRouteHref, items, scrollThreshold]);

  const activeLabel = activeRouteHref
    ? items.find(({ href }) => href === activeRouteHref)?.label
    : observedActiveLabel;

  return {
    activeLabel,
    open,
    setOpen,
    visible: activeRouteHref ? false : visible,
  };
}

/**
 * Renders active desktop links and the centered compact section selector.
 *
 * @param backToTopLabel - Accessible label for the Home control.
 * @param closeLabel - Accessible label for the sheet close control.
 * @param compactNavigationLabel - Accessible label for the no-JavaScript navigation.
 * @param defaultSectionLabel - Label shown before a section becomes active.
 * @param detailRoutes - Detail-route controls selected from the current pathname.
 * @param items - Section anchors shown by the shell.
 * @param navigationLabel - Accessible popover navigation label.
 * @param primaryNavigationLabel - Accessible label for the shell navigation.
 * @param scrollThreshold - Scroll offset that reveals the selector.
 * @param themeLabels - Accessible labels for each theme state.
 * @param triggerLabel - Accessible selector label.
 * @returns The compact navigation trigger and modal popover.
 */
export function MobileNavigation({
  backToTopLabel,
  closeLabel,
  compactNavigationLabel,
  defaultSectionLabel,
  detailRoutes,
  items,
  navigationLabel,
  primaryNavigationLabel,
  scrollThreshold,
  themeLabels,
  triggerLabel,
}: MobileNavigationProps) {
  const pathname = usePathname();
  const detailRoute = detailRoutes.find(({ routePrefix }) => pathname.startsWith(routePrefix));
  const activeRouteHref = pathname.startsWith("/projects")
    ? "#projects"
    : pathname.startsWith("/articles")
      ? "#writing"
      : undefined;
  const { activeLabel, open, setOpen, visible } = useSectionNavigationState(
    items,
    scrollThreshold,
    activeRouteHref,
  );

  if (detailRoute) {
    return (
      <nav
        aria-label={detailRoute.navigationLabel}
        className={clsx(headerStyles.navigation, "mx-auto grid h-full w-full grid-cols-3 items-center")}
      >
        <div className="flex items-center">
          <Link
            aria-label={detailRoute.homeLabel}
            className="inline-flex size-11 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 xl:size-8"
            href="/"
          >
            <House aria-hidden="true" className="size-ui-icon opacity-70" />
          </Link>
        </div>
        <Link
          className="text-ui-xs inline-flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-sm px-1.5 font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          data-slot="detail-back-link"
          href={detailRoute.backHref}
        >
          <ArrowLeft aria-hidden="true" className="size-3.5 opacity-70" />
          {detailRoute.backLabel}
        </Link>
        <div className="justify-self-end">
          <ThemeToggle labels={themeLabels} />
        </div>
      </nav>
    );
  }

  return (
    <nav
      aria-label={primaryNavigationLabel}
      className={clsx(headerStyles.navigation, "relative mx-auto flex h-full w-full items-center justify-between")}
    >
      <Link
        aria-label={backToTopLabel}
        className="inline-flex size-11 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 xl:size-8"
        href="/#top"
      >
        <House aria-hidden="true" className="size-ui-icon opacity-70" />
      </Link>
      <div className="desktop-link-row-gap text-ui-xs absolute left-1/2 hidden -translate-x-1/2 items-center whitespace-nowrap text-muted-foreground xl:flex">
        {items.map((item) => {
          const current = item.label === activeLabel;
          return (
            <a
              aria-current={current ? "location" : undefined}
              className={clsx("rounded-sm py-3 transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2", current && "font-semibold text-foreground")}
              href={`/${item.href}`}
              key={item.href}
            >
              {item.label}
            </a>
          );
        })}
      </div>
      <Dialog.Root modal open={open} onOpenChange={setOpen}>
        <Dialog.Trigger
          aria-label={triggerLabel}
          className={clsx(styles.trigger, "text-ui-xs invisible absolute left-1/2 inline-flex h-11 -translate-x-1/2 items-center rounded-sm bg-transparent pl-1.5 pr-1 font-medium opacity-0 transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 xl:hidden")}
          data-visible={visible}
        >
          {activeLabel ?? defaultSectionLabel}
          <ChevronDown aria-hidden="true" className={clsx(styles.chevron, "opacity-50")} />
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Backdrop
            className={clsx(styles.backdrop, "fixed z-40 xl:hidden")}
            data-slot="mobile-navigation-backdrop"
          />
          <Dialog.Popup
            data-slot="mobile-navigation-popup"
            finalFocus
            className={clsx(styles.popup, "fixed z-50 flex flex-col xl:hidden")}
          >
            <Dialog.Title className="sr-only">{triggerLabel}</Dialog.Title>
            <Dialog.Close
              aria-label={closeLabel}
              className={clsx(styles.close, "inline-flex size-11 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2")}
            >
              <X aria-hidden="true" className="size-ui-icon" />
            </Dialog.Close>
            <nav aria-label={navigationLabel} className={clsx(styles.menu, "overflow-y-auto p-3")}>
              {items.map((item) => {
                const current = item.label === activeLabel;
                return (
                  <a
                    aria-current={current ? "location" : undefined}
                    className={clsx(styles.link, "text-ui-xs flex min-h-11 items-center justify-between rounded-sm px-3 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2", current && "font-medium text-foreground")}
                    href={`/${item.href}`}
                    key={item.href}
                    onClick={() => {
                      setOpen(false);
                    }}
                  >
                    <span>{item.label}</span>
                    {current && <Check aria-hidden="true" className="size-ui-icon" />}
                  </a>
                );
              })}
            </nav>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
      <noscript>
        <details className="text-ui-xs absolute left-1/2 top-2 z-50 w-54 -translate-x-1/2 xl:hidden">
          <summary
            className={clsx(headerStyles.summary, "flex min-h-11 cursor-pointer list-none items-center justify-center font-medium")}
          >
            {triggerLabel}
          </summary>
          <nav
            aria-label={compactNavigationLabel}
            className="floating-menu-shadow rounded-md border bg-popover p-1.5"
          >
            {items.map((item) => (
              <a
                key={item.href}
                className="flex min-h-11 items-center rounded-sm px-2.5 text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                href={`/${item.href}`}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </details>
      </noscript>
      <ThemeToggle labels={themeLabels} />
    </nav>
  );
}
