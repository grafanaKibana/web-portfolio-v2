"use client";

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { clsx } from "clsx";
import { useState } from "react";

import styles from "./home-code-activity.module.scss";

/**
 * Renders shadcn's Base UI tooltip content in a portal outside the scrolling calendar.
 *
 * @param children - Accessible contribution date and count.
 * @returns The positioned tooltip content.
 */
function TooltipContent({ children }: { children: React.ReactNode }) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner sideOffset={4} className="isolate z-50">
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className="z-50 inline-flex w-fit max-w-xs items-center gap-1.5 rounded-xl bg-foreground px-3 py-1.5 text-xs text-background data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 data-closed:hidden motion-reduce:animate-none"
        >
          {children}
          <TooltipPrimitive.Arrow className={clsx(styles.tooltipArrow, "size-2 rotate-45 rounded-sm bg-foreground")} />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

/**
 * Adds hover, focus, and tap tooltips with one tab stop and chronological arrow navigation.
 *
 * @param days - Server-formatted contribution dates, levels, and accessible labels.
 * @returns The contribution cells with shadcn tooltips.
 */
export function CalendarDays({ days }: {
  days: readonly { date: string; level: number; label: string }[];
}) {
  const [focusedDay, setFocusedDay] = useState(0);
  const [openDay, setOpenDay] = useState<number | null>(null);

  return (
    <TooltipPrimitive.Provider delay={250}>
      <div className={styles.chartDays} role="group" aria-label="Daily contributions; use arrow keys to explore">
        {days.map((day, index) => (
          <TooltipPrimitive.Root key={day.date} open={openDay === index} onOpenChange={(open) => { setOpenDay((current) => open ? index : current === index ? null : current); }}>
            <TooltipPrimitive.Trigger
              type="button"
              className={clsx(styles.chartDay, "border-0 p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1")}
              data-level={day.level}
              data-slot="contribution-day"
              aria-label={day.label}
              tabIndex={focusedDay === index ? 0 : -1}
              closeOnClick={false}
              onFocus={() => { setFocusedDay(index); }}
              onClick={() => { setOpenDay(index); }}
              onKeyDown={(event) => {
                const offsets: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, ArrowRight: 7, ArrowLeft: -7 };
                const offset = offsets[event.key];
                if (offset === undefined && event.key !== "Home" && event.key !== "End") return;
                event.preventDefault();
                const next = event.key === "Home" ? 0 : event.key === "End" ? days.length - 1
                  : Math.max(0, Math.min(days.length - 1, index + (offset ?? 0)));
                const cells = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[data-slot='contribution-day']");
                cells?.[next]?.focus();
              }}
            />
            <TooltipContent>{day.label}</TooltipContent>
          </TooltipPrimitive.Root>
        ))}
      </div>
    </TooltipPrimitive.Provider>
  );
}
