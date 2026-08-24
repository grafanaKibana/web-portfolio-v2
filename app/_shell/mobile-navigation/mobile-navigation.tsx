"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Check, ChevronDown, X } from "lucide-react";
import { useEffect, useState } from "react";
import styles from "./mobile-navigation.module.scss";

interface MobileNavigationProps {
  closeLabel: string;
  defaultSectionLabel: string;
  items: readonly { label: string; href: string }[];
  navigationLabel: string;
  scrollThreshold: number;
  triggerLabel: string;
}

/**
 * Renders the centered compact section selector from the mobile reference.
 *
 * @param closeLabel - Accessible label for the sheet close control.
 * @param defaultSectionLabel - Label shown before a section becomes active.
 * @param items - YAML-authored section anchors.
 * @param navigationLabel - Accessible popover navigation label.
 * @param scrollThreshold - Scroll offset that reveals the selector.
 * @param triggerLabel - Accessible selector label.
 * @returns The compact navigation trigger and modal popover.
 */
export function MobileNavigation({
  closeLabel,
  defaultSectionLabel,
  items,
  navigationLabel,
  scrollThreshold,
  triggerLabel,
}: MobileNavigationProps) {
  const [activeLabel, setActiveLabel] = useState(defaultSectionLabel);
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    /** Updates selector visibility at the reference scroll threshold. */
    const updateVisibility = () => {
      const nextVisible = window.scrollY > scrollThreshold;
      setVisible(nextVisible);
      if (!nextVisible) setOpen(false);
    };

    const sections = items
      .map((item) => document.getElementById(item.href.slice(1)))
      .filter((section): section is HTMLElement => section !== null);
    const observer = new IntersectionObserver(
      (entries) => {
        const active = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
        const item = items.find(({ href }) => href === `#${active?.target.id}`);
        if (item) setActiveLabel(item.label);
      },
      { rootMargin: "-60px 0px -55% 0px", threshold: [0.01, 0.25, 0.5] },
    );

    sections.forEach((section) => observer.observe(section));
    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", updateVisibility);
    };
  }, [items, scrollThreshold]);

  return (
    <Dialog.Root modal open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        aria-label={triggerLabel}
        className={`${styles.trigger} text-ui-xs invisible absolute left-1/2 inline-flex h-11 -translate-x-1/2 items-center rounded-sm bg-transparent pl-1.5 pr-1 font-medium opacity-0 transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 lg:hidden`}
        data-visible={visible}
      >
        {activeLabel}
        <ChevronDown aria-hidden="true" className={`${styles.chevron} opacity-50`} />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop
          className={`${styles.backdrop} fixed z-40 lg:hidden`}
          data-slot="mobile-navigation-backdrop"
        />
        <Dialog.Popup
          data-slot="mobile-navigation-popup"
          finalFocus
          className={`${styles.popup} fixed z-50 flex flex-col lg:hidden`}
        >
          <Dialog.Title className="sr-only">{triggerLabel}</Dialog.Title>
          <Dialog.Close
            aria-label={closeLabel}
            className={`${styles.close} inline-flex size-11 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2`}
          >
            <X aria-hidden="true" className="size-ui-icon" />
          </Dialog.Close>
          <nav aria-label={navigationLabel} className={styles.menu}>
            {items.map((item) => {
              const current = item.label === activeLabel;
              return (
                <a
                  aria-current={current ? "location" : undefined}
                  className={`${styles.link} text-ui-xs flex items-center justify-between rounded-sm px-3 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2`}
                  data-current={current}
                  href={item.href}
                  key={item.href}
                  onClick={() => setOpen(false)}
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
  );
}
