import type { Metadata } from "next";
import Link from "next/link";

import { loadProjects } from "@/content/projects/server";
import { home } from "@/content/structured";

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
  const projects = await loadProjects();

  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-4xl flex-1 px-6 py-12 focus:outline-none lg:py-20">
      <h1 className="text-4xl font-semibold tracking-tight" data-page-motion-intro>Projects</h1>
      <ul className="mt-10 divide-y">
        {projects.map(({ slug, metadata: project }) => (
          <li data-page-motion-section key={slug}>
            <Link
              aria-labelledby={`${slug}-project-title`}
              className="group block rounded-sm py-8 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              data-page-motion-row
              data-slot="project-row"
              href={`/projects/${slug}`}
            >
              <article>
                <h2 data-page-motion-trigger id={`${slug}-project-title`} className="text-2xl font-semibold tracking-tight">
                  {project.title}
                </h2>
                <p className="mt-3 max-w-3xl leading-7 text-muted-foreground transition-colors group-hover:text-foreground group-focus-visible:text-foreground">
                  {project.description}
                </p>
                {project.tags?.length ? (
                  <p className="mt-3 font-mono text-xs text-muted-foreground" data-slot="project-technologies">
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
