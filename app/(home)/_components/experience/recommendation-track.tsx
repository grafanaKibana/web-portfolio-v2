"use client";

import { clsx } from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import styles from "./experience.module.scss";

/**
 * Synchronizes recommendation pages and edge fades with responsive scroll geometry.
 *
 * @param children - Server-rendered recommendation items.
 * @param heading - Server-rendered subsection heading beside the browsing controls.
 * @returns The scrollable recommendation list.
 */
export function RecommendationTrack({ children, heading }: { children: ReactNode; heading: ReactNode }) {
  const trackRef = useRef<HTMLUListElement>(null);
  const positionsRef = useRef([0]);
  const [fadedEdges, setFadedEdges] = useState("none");
  const [trackState, setTrackState] = useState({ index: 0, count: 0 });

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    /** Updates fades after scrolling or changes to the visible track width. */
    const updateFades = () => {
      const items = Array.from(track.children);
      const leadingEdge = track.getBoundingClientRect().left;
      const maximum = Math.max(0, track.scrollWidth - track.clientWidth);
      const contentEnd = (items.at(-1)?.getBoundingClientRect().right ?? leadingEdge) - leadingEdge + track.scrollLeft;
      const start = track.scrollLeft > 1;
      const end = track.scrollLeft + track.clientWidth < contentEnd - 1;

      let nextFadedEdges = "none";
      if (start && end) nextFadedEdges = "both";
      else if (start) nextFadedEdges = "start";
      else if (end) nextFadedEdges = "end";
      setFadedEdges(nextFadedEdges);

      const positions = [0];
      if (contentEnd > track.clientWidth + 1) {
        for (const item of items.slice(1)) {
          const offset = item.getBoundingClientRect().left - leadingEdge + track.scrollLeft;
          // Merge trailing padding into the first stop that reveals all remaining cards.
          const position = offset + track.clientWidth >= contentEnd - 1 ? maximum : Math.min(offset, maximum);
          const previousPosition = positions.at(-1);
          if (previousPosition !== undefined && position > previousPosition + 1) positions.push(position);
          if (position === maximum) break;
        }
      }
      positionsRef.current = positions;
      let index = 0;
      let closestDistance = Infinity;
      positions.forEach((position, pageIndex) => {
        const distance = Math.abs(position - track.scrollLeft);
        if (distance < closestDistance) {
          index = pageIndex;
          closestDistance = distance;
        }
      });

      if (!start) index = 0;
      else if (!end) index = positions.length - 1;
      setTrackState({ index, count: positions.length });
    };

    updateFades();
    track.addEventListener("scroll", updateFades, { passive: true });
    const observer = new ResizeObserver(updateFades);
    observer.observe(track);

    return () => {
      track.removeEventListener("scroll", updateFades);
      observer.disconnect();
    };
  }, [children]);

  /**
   * Moves to an adjacent reachable page using the visitor's motion preference.
   * @param direction - Previous or next recommendation page.
   */
  function browse(direction: -1 | 1) {
    const track = trackRef.current;
    const position = positionsRef.current[trackState.index + direction];
    if (!track || position === undefined) return;

    track.scrollTo({
      left: position,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }

  return (
    <>
      <div className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-3" data-page-motion-row>
        {heading}
        {trackState.count > 1 ? (
          <div className="ml-auto flex shrink-0 items-center gap-1" data-slot="recommendation-controls">
            <Button
              aria-label="Previous recommendation"
              disabled={trackState.index === 0}
              onClick={() => { browse(-1); }}
              size="icon"
              type="button"
              variant="ghost"
            >
              <ChevronLeft aria-hidden />
            </Button>
            <output aria-live="polite" className="whitespace-nowrap font-mono text-xs text-muted-foreground">
              {trackState.index + 1} / {trackState.count}
            </output>
            <Button
              aria-label="Next recommendation"
              disabled={trackState.index === trackState.count - 1}
              onClick={() => { browse(1); }}
              size="icon"
              type="button"
              variant="ghost"
            >
              <ChevronRight aria-hidden />
            </Button>
          </div>
        ) : null}
      </div>
      <ul
        aria-label="Recommendations"
        className={clsx(styles.recommendationTrack, "m-0 mt-6 flex snap-x snap-mandatory list-none gap-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden overflow-x-auto overscroll-x-contain overscroll-y-auto! p-0 pb-4 pr-[12%] focus-visible:outline-2 focus-visible:outline-offset-4 md:pr-[20%] lg:mt-8 lg:gap-12 lg:pr-[14%]")}
        data-edge-fade={fadedEdges}
        data-lenis-prevent-horizontal
        data-page-motion-row
        data-slot="recommendation-track"
        ref={trackRef}
        tabIndex={0}
      >
        {children}
      </ul>
    </>
  );
}
