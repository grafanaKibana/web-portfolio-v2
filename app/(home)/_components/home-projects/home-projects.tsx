import { Github, Obsidian } from "@thesvg/react";
import { ArrowUpRight, ExternalLink } from "lucide-react";
import Link from "next/link";

import { loadProjects } from "@/content/projects/server";
import { home } from "@/content/structured";
import { HomeEditorialRow } from "../home-editorial-row/home-editorial-row";

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
      className="home-section page-shell-gutter w-full last:min-h-screen"
      data-page-motion-section
    >
      <h2
        data-page-motion-row
        data-page-motion-trigger
        id="projects-heading"
        className="text-section-label mb-8 border-t pt-3 font-mono font-normal uppercase text-muted-foreground lg:mb-16 lg:pt-3.5"
      >
        Selected work
      </h2>
      <ul className="m-0 list-none p-0">
        {featuredProjects.map(({ slug, metadata: project }) => (
          <HomeEditorialRow
            dataSlot="home-project"
            key={slug}
            actions={(
              <>
                {project.links?.map((link) => (
                  <a
                    className="project-action-link"
                    href={link.href}
                    key={link.href}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {link.href.startsWith("https://obsidian.md/plugins")
                      ? <Obsidian aria-hidden="true" className="size-3.5 opacity-60" data-slot="obsidian-icon" variant="mono" />
                      : link.href.startsWith("https://github.com/")
                      ? <Github aria-hidden="true" className="size-3.5 opacity-60" variant="mono" />
                      : <ExternalLink aria-hidden="true" className="size-3.5 opacity-60" />}
                    {link.label}
                  </a>
                ))}
                <Link className="project-action-link" data-row-link href={`/projects/${slug}`}>
                  <ArrowUpRight aria-hidden="true" className="size-3.5 opacity-60" />
                  Read case study
                </Link>
              </>
            )}
            description={project.description}
            metadata={project.tags?.length ? (
              <ul
                aria-label={`${project.title} technologies`}
              >
                {project.tags.map((tag) => <li key={tag}>{tag}</li>)}
              </ul>
            ) : null}
            title={project.title}
          />
        ))}
      </ul>
      <Link
        className="flex min-h-12 w-full items-center border-t text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        data-page-motion-row
        data-slot="more-projects-link"
        href="/projects"
      >
        See other work
        <ArrowUpRight aria-hidden="true" className="ml-auto size-3.5 opacity-60" />
      </Link>
    </section>
  );
}
