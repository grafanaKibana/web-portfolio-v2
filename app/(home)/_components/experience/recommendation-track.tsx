"use client";

import { clsx } from "clsx";
import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./experience.module.scss";

/**
 * Keeps the recommendation fade aligned with content hidden by horizontal scrolling.
 *
 * @param children - Server-rendered recommendation items.
 * @returns The scrollable recommendation list.
 */
export function RecommendationTrack({ children }: { children: ReactNode }) {
  const trackRef = useRef<HTMLUListElement>(null);
  const [fadedEdges, setFadedEdges] = useState("none");

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    /** Updates fades after scrolling or changes to the visible track width. */
    const updateFades = () => {
      const start = track.scrollLeft > 1;
      const end = track.scrollLeft + track.clientWidth < track.scrollWidth - 1;
      setFadedEdges(start && end ? "both" : start ? "start" : end ? "end" : "none");
    };

    updateFades();
    track.addEventListener("scroll", updateFades, { passive: true });
    const observer = new ResizeObserver(updateFades);
    observer.observe(track);

    return () => {
      track.removeEventListener("scroll", updateFades);
      observer.disconnect();
    };
  }, []);

  return (
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
  );
}
