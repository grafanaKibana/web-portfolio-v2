import { Github, Obsidian } from "@thesvg/react";
import { ArrowUpRight, ExternalLink } from "lucide-react";
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
        className="m-0 mb-8 border-t pt-3 font-mono text-xs leading-4.5 font-semibold tracking-[0.08em] uppercase text-muted-foreground lg:mb-10 lg:pt-3.5"
      >
        Selected work
      </h2>
      <ul className="m-0 list-none p-0">
        {featuredProjects.map(({ slug, metadata: project }) => (
          <HomeEditorialRow
            askRecord={{ kind: "project", slug }}
            dataSlot="home-project"
            key={slug}
            actions={(
              <>
                {project.links?.map((link) => (
                  <a
                    className="action-link"
                    href={link.href}
                    key={link.href}
                    rel="noreferrer"
                    target="_blank"
                    title={link.label}
                  >
                    {link.href.startsWith("https://obsidian.md/plugins")
                      ? <Obsidian aria-hidden="true" className="action-icon opacity-60" data-slot="obsidian-icon" variant="mono" />
                      : link.href.startsWith("https://github.com/")
                      ? <Github aria-hidden="true" className="action-icon opacity-60" variant="mono" />
                      : <ExternalLink aria-hidden="true" className="action-icon opacity-60" />}
                    <span className="sr-only lg:not-sr-only">{link.label}</span>
                  </a>
                ))}
                <Link className="action-link" data-row-link href={`/projects/${slug}`}>
                  Read case study
                  <ArrowUpRight aria-hidden="true" className="action-icon opacity-60" />
                </Link>
              </>
            )}
            description={project.description}
            title={project.title}
          />
        ))}
      </ul>
      <Link
        className="flex min-h-12 w-full items-center text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        data-page-motion-row
        data-slot="more-projects-link"
        href="/projects"
      >
        See other work
        <ArrowUpRight aria-hidden="true" className="ml-auto action-icon opacity-60" />
      </Link>
    </section>
  );
}
