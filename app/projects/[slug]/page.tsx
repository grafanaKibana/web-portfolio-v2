import { Github, Obsidian } from "@thesvg/react";
import { clsx } from "clsx";
import { ArrowRight, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getProjectSlugs, loadProject } from "@/lib/content/projects/server";
import { PluginLinksService } from "@/lib/content/plugin-links";
import styles from "./project-page.module.scss";

const pluginLinks = new PluginLinksService();

/** Restricts project detail routes to statically generated slugs. */
export const dynamicParams = false;

/**
 * Provides every validated project slug for static generation.
 *
 * @returns Static project route parameters.
 */
export function generateStaticParams() {
  return getProjectSlugs().map((slug) => ({ slug }));
}

/**
 * Builds route metadata from a validated project.
 *
 * @param params - Promise containing the requested project slug.
 * @returns Metadata for the requested project.
 */
export async function generateMetadata({
  params,
}: PageProps<"/projects/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const project = await loadProject(slug);
  if (!project) notFound();

  return {
    title: project.metadata.title,
    description: project.metadata.description,
    alternates: { canonical: `/projects/${slug}` },
    openGraph: {
      type: "website",
      title: project.metadata.title,
      description: project.metadata.description,
    },
  };
}

/**
 * Renders one validated, statically generated project case study.
 *
 * @param params - Promise containing the requested project slug.
 * @returns The project page.
 */
export default async function ProjectPage({
  params,
}: PageProps<"/projects/[slug]">) {
  const { slug } = await params;
  const project = await loadProject(slug);
  if (!project) notFound();
  const projectSlugs = getProjectSlugs();
  const links = await pluginLinks.resolve(project.metadata.links);
  const nextSlug = projectSlugs[projectSlugs.indexOf(slug) + 1];
  const nextProject = nextSlug ? await loadProject(nextSlug) : undefined;

  return (
    <main id="main" tabIndex={-1} className="page-shell-gutter w-full flex-1 py-12 focus:outline-none lg:py-20">
      <article>
        <header className="pb-12" data-slot="project-hero">
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between" data-page-motion-intro data-slot="project-title-row">
            <h1 className="min-w-0 flex-1 [overflow-wrap:anywhere] text-balance text-[2rem] leading-[1.1875] font-semibold tracking-[-0.025em] md:text-5xl md:leading-[1.15]">{project.metadata.title.split(/(?<=\.)/).map((part, index) => <span key={index}>{part}<wbr /></span>)}</h1>
            {links.length ? (
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-6" data-slot="project-actions">
                {links.map((link) => {
                  let icon = <ExternalLink aria-hidden="true" className="size-3.5 opacity-60" />;
                  if (link.href.startsWith("https://obsidian.md/plugins")) {
                    icon = <Obsidian aria-hidden="true" className="size-3.5 opacity-60" data-slot="obsidian-icon" variant="mono" />;
                  } else if (link.href.startsWith("https://github.com/")) {
                    icon = <Github aria-hidden="true" className="size-3.5 opacity-60" variant="mono" />;
                  }

                  return (
                    <a
                      aria-label={link.ariaLabel}
                      className="action-link"
                      href={link.href}
                      key={link.href}
                      rel="noreferrer"
                      target="_blank"
                      title={link.ariaLabel}
                    >
                      {icon}
                      {link.label}
                    </a>
                  );
                })}
              </div>
            ) : null}
          </div>
          <p className="mt-5 text-lg leading-[1.875rem] text-content-foreground" data-page-motion-intro>
            {project.metadata.description}
          </p>
          {project.metadata.tags?.length ? (
            <p className="mt-6 font-mono text-xs leading-[1.125rem] text-muted-foreground" data-page-motion-intro>
              {project.metadata.tags.join(" · ")}
            </p>
          ) : null}
        </header>
        <hr aria-hidden="true" className="my-0 border-0 border-b" data-page-motion-intro />

        <div className={clsx(styles.content, "pt-6 text-base leading-7 [overflow-wrap:anywhere] [&>*:first-child]:mt-0")} data-page-motion-rows="children" data-page-motion-section data-page-motion-trigger>
          <project.Content />
        </div>
      </article>
      {nextProject ? (
        <nav
          aria-label="Project pagination"
          className="mt-20"
          data-page-motion-rows="children"
          data-page-motion-section
          data-page-motion-trigger
          data-slot="project-pagination"
        >
          <Link
            className="group block w-full border-t pt-8 text-right focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            data-slot="next-project"
            href={`/projects/${nextProject.slug}`}
          >
            <span className={clsx(styles.routeKicker, "block font-mono text-xs leading-[1.125rem] uppercase text-muted-foreground transition-colors group-hover:text-foreground group-focus-visible:text-foreground")}>
              Next
            </span>
            <span className="mt-3 inline-flex items-center gap-3 text-2xl font-medium tracking-tight">
              {nextProject.metadata.title}
              <ArrowRight
                aria-hidden="true"
                className="size-5 text-muted-foreground transition-colors group-hover:text-foreground group-focus-visible:text-foreground"
              />
            </span>
          </Link>
        </nav>
      ) : null}
    </main>
  );
}
