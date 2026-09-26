import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { HomeEditorialRow } from "@/app/(home)/_components/editorial-row/editorial-row";
import { loadProjects } from "@/lib/content/projects/server";
import { home } from "@/lib/content/portfolio/server";

/**
 * Renders validated local projects as editorial links to their static case studies.
 *
 * @returns The Home Selected Work section.
 */
export async function HomeProjects() {
  const projects = await loadProjects();
  const projectsBySlug = new Map(projects.map((project) => [project.slug, project]));
  const featuredProjects = home.projects.featuredSlugs.map((slug) => {
    const project = projectsBySlug.get(slug);
    if (!project) throw new Error(`Home projects: missing featured project "${slug}"`);
    return project;
  });

  return (
    <section
      id="projects"
      aria-labelledby="projects-heading"
      className="page-shell-gutter w-full scroll-mt-3 py-8 lg:-scroll-mt-5 lg:py-12 xl:-scroll-mt-1 last:min-h-screen"
      data-page-motion-section
    >
      <h2
        data-page-motion-row
        data-page-motion-trigger
        id="projects-heading"
        className="m-0 mb-8 font-sans text-2xl leading-[1.12] font-semibold tracking-[-0.03em] text-balance wrap-anywhere text-foreground lg:mb-10"
      >
        Selected work
      </h2>
      {featuredProjects.length ? <ul className="m-0 list-none p-0">
        {featuredProjects.map(({ slug, metadata: project }) => (
          <HomeEditorialRow
            askRecord={{ kind: "project", slug }}
            dataSlot="home-project"
            key={slug}
            actions={(
              <Link className="action-link" data-row-link href={`/projects/${slug}`}>
                <span className="sr-only">Read case study</span>
                <ArrowRight aria-hidden="true" className="action-icon opacity-60" />
              </Link>
            )}
            description={project.description}
            title={project.title}
          />
        ))}
      </ul> : <p className="m-0 text-sm text-content-foreground" data-page-motion-row>No featured projects right now. Browse all projects below.</p>}
      <Link
        className="flex min-h-12 w-full items-center text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        data-page-motion-row
        data-slot="more-projects-link"
        href="/projects"
      >
        See all projects
        <ArrowRight aria-hidden="true" className="ml-auto action-icon opacity-60" />
      </Link>
    </section>
  );
}
