"use client";

import { clsx } from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import styles from "./experience.module.scss";

/**
 * Keeps the recommendation fade aligned with content hidden by horizontal scrolling.
 *
 * @param children - Server-rendered recommendation items.
 * @param heading - Server-rendered subsection heading beside the browsing controls.
 * @returns The scrollable recommendation list.
 */
export function RecommendationTrack({ children, heading }: { children: ReactNode; heading: ReactNode }) {
  const trackRef = useRef<HTMLUListElement>(null);
  const [fadedEdges, setFadedEdges] = useState("none");
  const [trackState, setTrackState] = useState({ index: 0, count: 0, overflow: false });

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    /** Updates fades after scrolling or changes to the visible track width. */
    const updateFades = () => {
      const start = track.scrollLeft > 1;
      const end = track.scrollLeft + track.clientWidth < track.scrollWidth - 1;

      let nextFadedEdges = "none";
      if (start && end) nextFadedEdges = "both";
      else if (start) nextFadedEdges = "start";
      else if (end) nextFadedEdges = "end";
      setFadedEdges(nextFadedEdges);

      const items = Array.from(track.children);
      const leadingEdge = track.getBoundingClientRect().left;
      let index = 0;
      let closestDistance = Infinity;
      items.forEach((item, itemIndex) => {
        const distance = Math.abs(item.getBoundingClientRect().left - leadingEdge);
        if (distance < closestDistance) {
          index = itemIndex;
          closestDistance = distance;
        }
      });

      if (!start) index = 0;
      else if (!end) index = items.length - 1;
      setTrackState({ index, count: items.length, overflow: track.scrollWidth > track.clientWidth + 1 });
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
   * Moves to an adjacent quote using the visitor's motion preference.
   * @param direction - Previous or next recommendation.
   */
  function browse(direction: -1 | 1) {
    const track = trackRef.current;
    const item = track?.children.item(trackState.index + direction);
    if (!track || !item) return;

    track.scrollTo({
      left: track.scrollLeft + item.getBoundingClientRect().left - track.getBoundingClientRect().left,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }

  return (
    <>
      <div className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-3" data-page-motion-row>
        {heading}
        {trackState.count > 1 && trackState.overflow ? (
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
