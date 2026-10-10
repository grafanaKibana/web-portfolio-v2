import { clsx } from "clsx";
import { ArrowRight, Star } from "lucide-react";
import Link from "next/link";

import { HomeEditorialRow } from "@/app/(home)/_components/editorial-row/editorial-row";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { loadProjects } from "@/lib/content/projects/server";
import { home } from "@/lib/content/portfolio/server";

import styles from "./projects.module.scss";
import { RepositoryStarsService } from "./repository-stars";

const repositoryStars = new RepositoryStarsService();

/**
 * Renders validated local projects as editorial links to their static case studies.
 *
 * @returns The Home Selected Work section.
 */
export async function HomeProjects() {
  const [projects, totalStars] = await Promise.all([
    loadProjects(),
    repositoryStars.load(home.codeActivity.username),
  ]);
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
      className="page-shell-gutter w-full scroll-mt-[calc(var(--site-header-top)+var(--site-header-height)-1rem)] py-8 lg:scroll-mt-[calc(var(--site-header-top)+var(--site-header-height)-2rem)] lg:py-12 last:min-h-screen"
      data-page-motion-section
    >
      <div
        data-page-motion-row
        data-page-motion-trigger
        className="mb-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 lg:mb-10"
      >
        <h2
          id="projects-heading"
          className="m-0 font-sans text-2xl leading-[1.12] font-semibold tracking-[-0.03em] text-balance wrap-anywhere text-foreground"
        >
          Selected work
        </h2>
        {totalStars !== null && (
          <TooltipProvider delay={250}>
            <Tooltip>
              <TooltipTrigger
                type="button"
                aria-label={`${totalStars.toLocaleString("en-US")} total stars across public GitHub repositories`}
                className={clsx(styles.totalStars, "-my-2 inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-sm whitespace-nowrap font-mono text-xs tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2")}
              >
                {totalStars.toLocaleString("en-US")}
                <Star aria-hidden="true" className="size-4 fill-current" />
              </TooltipTrigger>
              <TooltipContent className="data-closed:hidden motion-reduce:animate-none">Total Stars</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      {featuredProjects.length ? <ul className="m-0 list-none p-0">
        {featuredProjects.map(({ slug, metadata: project }) => (
          <HomeEditorialRow
            askRecord={{ kind: "project", slug }}
            dataSlot="home-project"
            key={slug}
            actions={(
              <Link className="action-link" data-row-link href={`/projects/${slug}`}>
                <span className="sr-only">Read case study: {project.title}</span>
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
