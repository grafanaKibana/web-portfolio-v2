import { ArrowBigDownDash, Star } from "lucide-react";

import type { ProjectMetrics as ProjectMetricsData } from "../_lib/project-metrics.models";

/**
 * Shows available project counts with accessible labels and quiet, aligned numerals.
 *
 * @param metrics - Optional star and total download counts, including known zeroes.
 * @returns Inline project metrics, or nothing when both counts are unavailable.
 */
export function ProjectMetrics({ metrics }: { metrics: ProjectMetricsData }) {
  if (metrics.stars === null && metrics.downloads === null) return null;

  return (
    <span className="inline-flex shrink-0 items-center justify-end gap-3 font-mono text-xs leading-7 whitespace-nowrap text-muted-foreground tabular-nums" data-slot="project-metrics">
      {metrics.stars !== null && (
        <span className="inline-flex items-center gap-1" data-project-stars={metrics.stars} title="GitHub stars">
          {metrics.stars.toLocaleString("en-US")}
          <span className="sr-only"> stars</span>
          <Star aria-hidden="true" className="size-3.5" />
        </span>
      )}
      {metrics.downloads !== null && (
        <span className="inline-flex items-center gap-1" data-project-downloads={metrics.downloads} title="Total downloads">
          {metrics.downloads.toLocaleString("en-US")}
          <span className="sr-only"> total downloads</span>
          <ArrowBigDownDash aria-hidden="true" className="size-3.5" />
        </span>
      )}
    </span>
  );
}
