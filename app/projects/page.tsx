import type { Metadata } from "next";
import Link from "next/link";

import { loadProjects } from "@/lib/content/projects/server";
import { home } from "@/lib/content/portfolio/server";

import { ProjectMetrics } from "./_components/project-metrics";
import { ProjectMetricsService } from "./_lib/project-metrics";

const projectMetrics = new ProjectMetricsService();

/** Search and sharing metadata for the project collection. */
export const metadata: Metadata = {
  title: "Projects",
  description: home.projects.indexDescription,
};

/**
 * Loads and renders the statically discovered project listing.
 *
 * @returns The project listing page.
 */
export default async function ProjectsPage() {
  const projects = await projectMetrics.enrich(await loadProjects());

  return (
    <main id="main" tabIndex={-1} className="page-shell-gutter w-full flex-1 py-12 focus:outline-none lg:py-20">
      <h1 className="text-4xl font-semibold tracking-tight" data-page-motion-intro>Projects</h1>
      <ul className="mt-10 [&>li:not(:last-child)>a]:border-b">
        {projects.map(({ slug, metadata: project, metrics }) => (
          <li
            data-ask-record-kind="project"
            data-ask-record-slug={slug}
            data-page-motion-section
            key={slug}
          >
            <Link
              aria-labelledby={`${slug}-project-title`}
              className="group block rounded-sm py-8 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              data-page-motion-row
              data-slot="project-row"
              href={`/projects/${slug}`}
            >
              <article>
                <div className="flex items-start justify-between gap-4">
                  <h2 data-page-motion-trigger id={`${slug}-project-title`} className="min-w-0 text-2xl font-semibold tracking-tight wrap-anywhere">
                    {project.title}
                  </h2>
                  <ProjectMetrics metrics={metrics} />
                </div>
                <p className="mt-3 text-sm leading-6 text-content-foreground transition-colors group-hover:text-foreground group-focus-visible:text-foreground">
                  {project.description}
                </p>
                {project.tags?.length ? (
                  <p className="mt-3 font-mono text-xs leading-[1.125rem] text-muted-foreground transition-colors group-hover:text-foreground group-focus-visible:text-foreground" data-slot="project-technologies">
                    {project.tags.join(" · ")}
                  </p>
                ) : null}
              </article>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
