"use client";

import { clsx } from "clsx";
import { Star } from "lucide-react";
import { useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import styles from "./projects.module.scss";

/**
 * Shows the repository star count with a tooltip available by hover, focus, or tap.
 * @param totalStars - Complete public repository star total.
 * @returns The accessible gold star counter.
 */
export function StarCounter({ totalStars }: { totalStars: number }) {
  const [open, setOpen] = useState(false);

  return (
    <TooltipProvider delay={250}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger
          type="button"
          aria-label={`${totalStars.toLocaleString("en-US")} total stars across public GitHub repositories`}
          className={clsx(styles.totalStars, "-my-2 inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-sm whitespace-nowrap font-mono text-xs tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2")}
          closeOnClick={false}
          onClick={() => { setOpen(true); }}
        >
          {totalStars.toLocaleString("en-US")}
          <Star aria-hidden="true" className="size-4 fill-current" />
        </TooltipTrigger>
        <TooltipContent className="data-closed:hidden motion-reduce:animate-none">Total Stars</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
