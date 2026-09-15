import { clsx } from "clsx";
import type { LucideIcon } from "lucide-react";

import type { CodeContribution, CodeContributionStatus } from "./activity";

const pullRequestPeriod = new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" });
const pullRequestCount = new Intl.NumberFormat("en-US");
const visibleContributionCount = 3;

/** CSS module classes used by the pull-request group presentation. */
export interface PullRequestGroupStyles {
  group: string | undefined;
  groupLabel: string | undefined;
  contribution: string | undefined;
  statusIcon: string | undefined;
  copy: string | undefined;
  repository: string | undefined;
  title: string | undefined;
  meta: string | undefined;
  period: string | undefined;
  diff: string | undefined;
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
        className={clsx(styles.contribution, "rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2")}
        data-slot="pull-request-row"
        href={contribution.href}
        rel="noreferrer"
        target="_blank"
      >
        <StatusIcon
          aria-hidden="true"
          className={styles.statusIcon}
          data-slot="pull-request-status"
          data-status={status}
        />
        <span className={styles.copy} data-slot="pull-request-copy">
          <span className={clsx(styles.repository, "font-mono")}>
            {contribution.repository} #{contribution.number}
          </span>
          <span className={clsx(styles.title, "font-medium tracking-tight")} data-slot="pull-request-title">
            {contribution.title}
          </span>
        </span>
        <span className={clsx(styles.meta, "font-mono")} data-slot="pull-request-meta">
          <time className={styles.period} dateTime={contribution.date} data-slot="pull-request-date">
            {pullRequestPeriod.format(new Date(contribution.date))}
          </time>
          <span className={styles.diff} data-slot="pull-request-diff">
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
 * @param props - Status metadata, sorted contributions, icon, and presentation classes.
 * @returns The status group, or null when it has no contributions.
 */
export function PullRequestGroup(props: PullRequestGroupProps) {
  const { status, label, contributions, icon, styles } = props;
  if (contributions.length === 0) return null;

  const visibleContributions = contributions.slice(0, visibleContributionCount);
  const remainingContributions = contributions.slice(visibleContributionCount);

  return (
    <section className={styles.group} data-slot="pull-request-group">
      <h3 className={clsx(styles.groupLabel, "m-0 font-mono font-normal uppercase text-muted-foreground")} data-page-motion-row>
        {label}
      </h3>
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
      {remainingContributions.length > 0 ? (
        <details className={styles.disclosure} data-slot="pull-request-disclosure">
          <summary className={clsx(styles.disclosureSummary, "font-mono uppercase text-muted-foreground")} data-slot="pull-request-disclosure-summary">
            <span data-slot="show-more">
              Show more ({remainingContributions.length}) <span className="sr-only">{label} pull requests</span>
            </span>
            <span data-slot="show-less">
              Show less <span className="sr-only">{label} pull requests</span>
            </span>
          </summary>
          <ul
            aria-label={`More ${label} contributions`}
            className={clsx(styles.remainder, "m-0 list-none p-0")}
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
        </details>
      ) : null}
    </section>
  );
}
