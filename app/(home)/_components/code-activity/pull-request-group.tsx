import type { ReactNode } from "react";
import { clsx } from "clsx";
import { ArrowDown, type LucideIcon } from "lucide-react";

import type {
  CodeContribution,
  CodeContributionStatus,
} from "@/lib/content/github-activity.models";
import { Subheading } from "../subheading";

const pullRequestPeriod = new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" });
const pullRequestCount = new Intl.NumberFormat("en-US");
const visibleContributionCount = 3;

/** CSS module classes used by the pull-request group presentation. */
export interface PullRequestGroupStyles {
  statusIcon: string | undefined;
  additions: string | undefined;
  deletions: string | undefined;
  disclosure: string | undefined;
  disclosureSummary: string | undefined;
  remainder: string | undefined;
}

/** Props for one status-specific pull-request group. */
export interface PullRequestGroupProps {
  status: CodeContributionStatus;
  label: string;
  contributions: readonly CodeContribution[];
  icon: LucideIcon;
  styles: PullRequestGroupStyles;
  children?: ReactNode;
}

/** Props for one compact pull-request row. */
interface PullRequestRowProps {
  contribution: CodeContribution;
  status: CodeContributionStatus;
  icon: LucideIcon;
  styles: PullRequestGroupStyles;
  animate: boolean;
}

/**
 * Renders one compact external pull-request row.
 *
 * @param props - Pull-request content, status, icon, styles, and entrance-animation eligibility.
 * @returns One semantic list item containing an external pull-request link.
 */
function PullRequestRow(props: PullRequestRowProps) {
  const { contribution, status, icon: StatusIcon, styles, animate } = props;
  return (
    <li className="border-t first:border-t-0" data-page-motion-row={animate ? "" : undefined}>
      <a
        className="group/pull-request grid min-h-11 min-w-0 grid-cols-[1.1rem_minmax(0,1fr)_auto] items-center gap-x-2.5 rounded-sm py-4 text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        data-slot="pull-request-row"
        href={contribution.href}
        rel="noreferrer"
        target="_blank"
      >
        <StatusIcon
          aria-hidden="true"
          className={clsx(styles.statusIcon, "size-4")}
          data-slot="pull-request-status"
          data-status={status}
        />
        <span className="grid min-w-0 gap-1 text-left" data-slot="pull-request-copy">
          <span className="font-mono text-xs leading-4.5 text-muted-foreground [overflow-wrap:anywhere]">
            {contribution.repository} #{contribution.number}
          </span>
          <span className="min-w-0 text-base font-medium tracking-tight text-content-foreground transition-colors [overflow-wrap:anywhere] group-hover/pull-request:text-foreground group-focus-visible/pull-request:text-foreground" data-slot="pull-request-title">
            {contribution.title}
          </span>
        </span>
        <span className="flex flex-col items-end gap-1 self-center whitespace-nowrap font-mono text-xs leading-4.5" data-slot="pull-request-meta">
          <time className="whitespace-nowrap text-muted-foreground" dateTime={contribution.date} data-slot="pull-request-date">
            {pullRequestPeriod.format(new Date(contribution.date))}
          </time>
          <span className="inline-flex gap-2 tabular-nums" data-slot="pull-request-diff">
            <span aria-hidden="true" className={styles.additions}>
              +{pullRequestCount.format(contribution.additions)}
            </span>
            <span aria-hidden="true" className={styles.deletions}>
              −{pullRequestCount.format(contribution.deletions)}
            </span>
            <span className="sr-only">
              {pullRequestCount.format(contribution.additions)} {contribution.additions === 1 ? "addition" : "additions"} and {pullRequestCount.format(contribution.deletions)} {contribution.deletions === 1 ? "deletion" : "deletions"}
            </span>
          </span>
        </span>
      </a>
    </li>
  );
}

/**
 * Renders the latest pull requests for one status with a native expandable remainder.
 *
 * @param props - Status metadata, sorted contributions, styles, and optional content revealed after the list.
 * @returns The status group, or null when it has neither contributions nor expandable content.
 */
export function PullRequestGroup(props: PullRequestGroupProps) {
  const { status, label, contributions, icon, styles, children } = props;
  if (contributions.length === 0 && !children) return null;

  const visibleContributions = contributions.slice(0, visibleContributionCount);
  const remainingContributions = contributions.slice(visibleContributionCount);

  return (
    <section data-slot="pull-request-group">
      {contributions.length > 0 ? (
        <>
          <Subheading data-page-motion-row>{label}</Subheading>
          <ul aria-label={`${label} contributions`} className="m-0 mt-4 list-none p-0">
            {visibleContributions.map((contribution) => (
              <PullRequestRow
                animate
                contribution={contribution}
                icon={icon}
                key={contribution.href}
                status={status}
                styles={styles}
              />
            ))}
          </ul>
        </>
      ) : null}
      {remainingContributions.length > 0 || children ? (
        <details className={clsx(styles.disclosure, "group/disclosure flex flex-col")} data-slot="pull-request-disclosure">
          <summary className={clsx(styles.disclosureSummary, "order-1 flex min-h-12 w-full cursor-pointer list-none items-center text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2")} data-slot="pull-request-disclosure-summary">
            <span data-slot="show-more">
              Show more{remainingContributions.length > 0 ? ` (${String(remainingContributions.length)})` : ""} <span className="sr-only">{label} {remainingContributions.length > 0 ? "pull requests" : "activity"}</span>
            </span>
            <span data-slot="show-less">
              Show less <span className="sr-only">{label} {remainingContributions.length > 0 ? "pull requests" : "activity"}</span>
            </span>
            <ArrowDown aria-hidden="true" className="ml-auto action-icon opacity-60 group-open/disclosure:rotate-180" />
          </summary>
          <div className={styles.remainder}>
            {remainingContributions.length > 0 ? (
              <ul
                aria-label={`More ${label} contributions`}
                className="m-0 list-none p-0"
                data-slot="pull-request-remainder"
              >
                {remainingContributions.map((contribution) => (
                  <PullRequestRow
                    animate={false}
                    contribution={contribution}
                    icon={icon}
                    key={contribution.href}
                    status={status}
                    styles={styles}
                  />
                ))}
              </ul>
            ) : null}
            {children}
          </div>
        </details>
      ) : null}
    </section>
  );
}
