import { Github, Obsidian } from "@thesvg/react";
import { clsx } from "clsx";
import { ArrowUpRight, ExternalLink } from "lucide-react";
import Link from "next/link";

import { loadProjects } from "@/content/projects/server";
import { home } from "@/content/structured";
import styles from "./home-projects.module.scss";

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
      className={clsx(styles.projects, "page-shell-gutter w-full last:min-h-screen")}
    >
      <h2
        id="projects-heading"
        className={clsx(styles.sectionLabel, "mb-8 border-t pt-3 font-mono font-normal uppercase text-muted-foreground lg:mb-16 lg:pt-3.5")}
      >
        {home.projects.label}
      </h2>
      <ul className="m-0 list-none p-0">
        {featuredProjects.map(({ slug, metadata: project }) => (
          <li className={clsx(styles.project, "border-t lg:first:border-t-0")} data-slot="home-project" key={slug}>
            <article className={styles.projectBody}>
              <h3 className={clsx(styles.projectTitle, "m-0 font-medium tracking-tight")}>{project.title}</h3>
              <p className={clsx(styles.projectDescription, "m-0 mt-2.5 text-muted-foreground")}>
                {project.description}
              </p>
              {project.tags?.length ? (
                <ul
                  aria-label={`${project.title} technologies`}
                  className={clsx(styles.projectTags, "m-0 flex list-none flex-wrap gap-x-2 gap-y-1 p-0 font-mono text-muted-foreground lg:flex-col lg:items-end lg:gap-1.5 lg:pt-1.5")}
                >
                  {project.tags.map((tag) => <li key={tag}>{tag}</li>)}
                </ul>
              ) : null}
              <div
                className={clsx(styles.projectActions, "mt-2 flex flex-wrap items-center gap-x-6")}
                data-slot="project-actions"
              >
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
                <Link
                  className="project-action-link"
                  href={`/projects/${slug}`}
                >
                  <ArrowUpRight aria-hidden="true" className="size-3.5 opacity-60" />
                  {home.projects.caseStudyLabel}
                </Link>
              </div>
            </article>
          </li>
        ))}
      </ul>
      <Link
        className="flex min-h-12 w-full items-center border-t text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        data-slot="more-projects-link"
        href="/projects"
      >
        {home.projects.moreWorkLabel}
        <ArrowUpRight aria-hidden="true" className="ml-auto size-3.5 opacity-60" />
      </Link>
    </section>
  );
}
