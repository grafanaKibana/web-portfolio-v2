"use client";

import { clsx } from "clsx";
import { ArrowLeft, BriefcaseBusiness, ChevronDown, CodeXml, Folder, GraduationCap, House, Mail, PenLine, UserRound, Wrench } from "lucide-react";
import Link from "next/link";
import { useSelectedLayoutSegments } from "next/navigation";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { BrandMark } from "@/components/brand-mark/brand-mark";
import { ThemeToggle } from "@/components/theme/theme";
import { getVisibleSectionId } from "@/lib/section-context";
import styles from "./mobile-navigation.module.scss";
import headerStyles from "../site-header.module.scss";

const headerIconButtonClassName = buttonVariants({
  className: "size-11 text-foreground xl:size-8",
  size: "icon-sm",
  variant: "ghost",
});

const items = [
  { label: "About", href: "#about", icon: UserRound },
  { label: "Experience", href: "#experience", icon: BriefcaseBusiness },
  { label: "Education", href: "#education", icon: GraduationCap },
  { label: "Skills", href: "#skills", icon: Wrench },
  { label: "Projects", href: "#projects", icon: Folder },
  { label: "Code", href: "#code", icon: CodeXml },
  { label: "Writing", href: "#writing", icon: PenLine },
  { label: "Contact", href: "#contact", icon: Mail },
] as const;

interface MobileNavigationProps {
  backToTopLabel: string;
  compactNavigationLabel: string;
  defaultSectionLabel: string;
  homeLabel: string;
  detailRoutes: readonly {
    backHref: string;
    backLabel: string;
    navigationLabel: string;
    routePrefix: string;
  }[];
  navigationLabel: string;
  primaryNavigationLabel: string;
  scrollThreshold: number;
  themeLabels: {
    change: string;
    switchToDark: string;
    switchToLight: string;
    switchToSystem: string;
  };
  triggerLabel: string;
}

/**
 * Tracks the active section plus compact-selector visibility and modal state.
 *
 * @param scrollThreshold - Scroll offset that reveals the selector.
 * @param activeRouteHref - Section represented by a non-Home collection route.
 * @returns The current navigation state and modal setter.
 */
function useSectionNavigationState(
  scrollThreshold: number,
  activeRouteHref?: string,
) {
  const [observedActiveLabel, setObservedActiveLabel] = useState<string>();
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (activeRouteHref) return;

    const sectionIds = items.map((item) => item.href.slice(1));

    /** Updates selector visibility and the section at the sticky-header edge. */
    const updateNavigation = () => {
      const nextVisible = window.scrollY > scrollThreshold;
      setVisible(nextVisible);
      if (!nextVisible) setOpen(false);

      const sectionId = getVisibleSectionId(sectionIds);
      const item = sectionId
        ? items.find(({ href }) => href === `#${sectionId}`)
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
  }, [activeRouteHref, scrollThreshold]);

  const activeLabel = activeRouteHref
    ? items.find(({ href }) => href === activeRouteHref)?.label
    : observedActiveLabel;

  return {
    activeLabel,
    open,
    setOpen,
    visible: Boolean(activeRouteHref) || visible,
  };
}

/**
 * Renders active desktop links and the centered compact section selector.
 *
 * @param backToTopLabel - Accessible label for the Home control.
 * @param compactNavigationLabel - Accessible label for the no-JavaScript navigation.
 * @param defaultSectionLabel - Label shown before a section becomes active.
 * @param detailRoutes - Detail-route controls selected from the active router segments.
 * @param homeLabel - Accessible name for the mark linking from collection pages to Home.
 * @param navigationLabel - Accessible popover navigation label.
 * @param primaryNavigationLabel - Accessible label for the shell navigation.
 * @param scrollThreshold - Scroll offset that reveals the selector.
 * @param themeLabels - Accessible labels for each theme state.
 * @param triggerLabel - Accessible selector label.
 * @returns The compact navigation trigger and modal popover.
 */
export function MobileNavigation({
  backToTopLabel,
  compactNavigationLabel,
  defaultSectionLabel,
  detailRoutes,
  homeLabel,
  navigationLabel,
  primaryNavigationLabel,
  scrollThreshold,
  themeLabels,
  triggerLabel,
}: MobileNavigationProps) {
  const [routeSegment, detailSegment] = useSelectedLayoutSegments()
    .filter((segment) => !segment.startsWith("("));
  const routeHref = routeSegment ? `/${routeSegment}` : undefined;
  const detailRoute = detailSegment && routeSegment
    ? detailRoutes.find(({ routePrefix }) => routePrefix === `/${routeSegment}/`)
    : undefined;
  const activeRouteHref = routeHref === "/projects"
    ? "#projects"
    : routeHref === "/articles"
      ? "#writing"
      : undefined;
  const { activeLabel, open, setOpen, visible } = useSectionNavigationState(
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
            aria-label={homeLabel}
            className={headerIconButtonClassName}
            href="/"
          >
            <span className="relative size-4 text-foreground">
              <BrandMark className="absolute inset-0 size-4 transition-[opacity,scale,rotate] duration-300 ease-out group-hover/button:scale-75 group-hover/button:-rotate-12 group-hover/button:opacity-0 group-focus-visible/button:scale-75 group-focus-visible/button:-rotate-12 group-focus-visible/button:opacity-0 motion-reduce:transition-none" />
              <House aria-hidden className="absolute inset-0 size-4 scale-75 rotate-12 opacity-0 transition-[opacity,scale,rotate] duration-300 ease-out group-hover/button:scale-100 group-hover/button:rotate-0 group-hover/button:opacity-100 group-focus-visible/button:scale-100 group-focus-visible/button:rotate-0 group-focus-visible/button:opacity-100 motion-reduce:transition-none" />
            </span>
          </Link>
        </div>
        <Link
          className="text-ui-xs inline-flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-sm px-1.5 font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
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

  const sectionLinks = items.map(({ href, label, icon: Icon }) => {
    const current = label === activeLabel;
    return (
      <a
        aria-current={current ? "location" : undefined}
        className="text-ui-xs flex min-h-11 items-center gap-3 rounded-sm px-3 text-foreground transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 aria-[current=location]:font-bold"
        href={`/${href}`}
        key={href}
        onClick={() => { setOpen(false); }}
      >
        <Icon aria-hidden="true" className={clsx("size-4 shrink-0", !current && "text-muted-foreground")} strokeWidth={current ? 3 : 2} />
        {label}
      </a>
    );
  });

  return (
    <nav
      aria-label={primaryNavigationLabel}
      className={clsx(headerStyles.navigation, "relative mx-auto flex h-full w-full items-center justify-between")}
    >
      <Link
        aria-label={activeRouteHref ? homeLabel : backToTopLabel}
        className={headerIconButtonClassName}
        href="/#top"
      >
        <span className="relative size-4 text-foreground">
          <BrandMark className="absolute inset-0 size-4 transition-[opacity,scale,rotate] duration-300 ease-out group-hover/button:scale-75 group-hover/button:-rotate-12 group-hover/button:opacity-0 group-focus-visible/button:scale-75 group-focus-visible/button:-rotate-12 group-focus-visible/button:opacity-0 motion-reduce:transition-none" />
          <House aria-hidden className="absolute inset-0 size-4 scale-75 rotate-12 opacity-0 transition-[opacity,scale,rotate] duration-300 ease-out group-hover/button:scale-100 group-hover/button:rotate-0 group-hover/button:opacity-100 group-focus-visible/button:scale-100 group-focus-visible/button:rotate-0 group-focus-visible/button:opacity-100 motion-reduce:transition-none" />
        </span>
      </Link>
      <div className="desktop-link-row-gap text-ui-xs absolute left-1/2 hidden -translate-x-1/2 items-center whitespace-nowrap text-muted-foreground xl:flex">
        {items.map((item) => {
          const current = item.label === activeLabel;
          return (
            <a
              aria-current={current ? "location" : undefined}
              className={clsx("rounded-sm py-3 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2", current && "font-semibold text-foreground")}
              href={`/${item.href}`}
              key={item.href}
            >
              {item.label}
            </a>
          );
        })}
      </div>
      <Sheet modal open={open} onOpenChange={setOpen}>
        <SheetTrigger
          aria-label={triggerLabel}
          className={clsx(styles.trigger, "text-ui-xs invisible absolute left-1/2 inline-flex h-11 -translate-x-1/2 items-center rounded-sm bg-transparent pl-1.5 pr-1 font-medium text-muted-foreground opacity-0 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 xl:hidden")}
          data-visible={visible}
        >
          {activeLabel ?? defaultSectionLabel}
          <ChevronDown aria-hidden="true" className={clsx(styles.chevron, "opacity-50")} />
        </SheetTrigger>
        <SheetContent
          className={clsx(styles.popup, "bg-background text-foreground motion-reduce:transition-none xl:hidden")}
          data-portfolio-navigation-sheet
          finalFocus
          onBackdropClick={() => { setOpen(false); }}
          showCloseButton={false}
          side="top"
        >
          <SheetTitle className="sr-only">{triggerLabel}</SheetTitle>
          <nav aria-label={navigationLabel} className="overflow-y-auto overscroll-contain p-3" data-lenis-prevent>
            {sectionLinks}
          </nav>
        </SheetContent>
      </Sheet>
      <noscript>
        <button
          className="text-ui-xs absolute left-1/2 flex min-h-11 -translate-x-1/2 items-center rounded-sm px-3 font-medium text-muted-foreground focus-visible:outline xl:hidden"
          popoverTarget="compact-section-menu"
          type="button"
        >
          {triggerLabel}
        </button>
        <nav
          aria-label={compactNavigationLabel}
          className={clsx(styles.popup, "fixed inset-x-0 top-0 m-0 w-full overflow-y-auto overscroll-contain border-b bg-background p-3 text-foreground shadow-xl xl:hidden")}
          id="compact-section-menu"
          popover="auto"
        >
          {sectionLinks}
        </nav>
      </noscript>
      <ThemeToggle labels={themeLabels} />
    </nav>
  );
}
