"use client";

import { clsx } from "clsx";
import { useState, type ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import styles from "./code-activity.module.scss";

/**
 * Shows pull-request status counters with one tooltip available by hover, focus, or tap.
 * @param counters - Visible counts, labels, statuses, and server-rendered icons.
 * @returns Interactive counter controls preserving the supplied order.
 */
export function ActivityCounters({ counters }: {
  counters: readonly { status: string; label: string; count: number; icon: ReactNode }[];
}) {
  const [openStatus, setOpenStatus] = useState<string | null>(null);

  return (
    <TooltipProvider delay={250}>
      {counters.map(({ status, label, count, icon }) => (
        <Tooltip key={status} open={openStatus === status} onOpenChange={(open) => { setOpenStatus((current) => open ? status : current === status ? null : current); }}>
          <TooltipTrigger
            type="button"
            aria-label={`${count.toLocaleString("en-US")} ${label.toLowerCase()} pull requests`}
            className={clsx(styles.statusIcon, "-my-3 inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2")}
            data-status={status}
            closeOnClick={false}
            onClick={() => { setOpenStatus(status); }}
          >
            {count.toLocaleString("en-US")}
            {icon}
          </TooltipTrigger>
          <TooltipContent className="data-closed:hidden motion-reduce:animate-none">{label} pull requests</TooltipContent>
        </Tooltip>
      ))}
    </TooltipProvider>
  );
}
