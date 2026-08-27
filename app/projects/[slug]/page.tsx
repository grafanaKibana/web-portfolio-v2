import { Github, Obsidian } from "@thesvg/react";
import { ArrowRight, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getProjectSlugs, loadProject } from "@/content/projects/server";

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
  const nextSlug = projectSlugs[projectSlugs.indexOf(slug) + 1];
  const nextProject = nextSlug ? await loadProject(nextSlug) : undefined;

  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-4xl flex-1 px-6 py-12 focus:outline-none lg:py-20">
      <article>
        <header className="border-b pb-10" data-slot="project-hero">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between" data-slot="project-title-row">
            <h1 className="min-w-0 text-4xl font-semibold tracking-tight">{project.metadata.title}</h1>
            {project.metadata.links?.length ? (
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-6" data-slot="project-actions">
                {project.metadata.links.map((link) => {
                  let icon = <ExternalLink aria-hidden="true" className="size-3.5 opacity-60" />;
                  if (link.href.startsWith("https://obsidian.md/plugins")) {
                    icon = <Obsidian aria-hidden="true" className="size-3.5 opacity-60" data-slot="obsidian-icon" variant="mono" />;
                  } else if (link.href.startsWith("https://github.com/")) {
                    icon = <Github aria-hidden="true" className="size-3.5 opacity-60" variant="mono" />;
                  }

                  return (
                    <a
                      className="project-action-link"
                      href={link.href}
                      key={link.href}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {icon}
                      {link.label}
                    </a>
                  );
                })}
              </div>
            ) : null}
          </div>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            {project.metadata.description}
          </p>
          {project.metadata.tags?.length ? (
            <p className="mt-6 font-mono text-xs text-muted-foreground">
              {project.metadata.tags.join(" · ")}
            </p>
          ) : null}
        </header>

        <div className="pt-6">
          <project.Content />
        </div>
      </article>
      {nextProject ? (
        <nav
          aria-label="Project pagination"
          className="mt-20 border-t pt-8"
          data-slot="project-pagination"
        >
          <Link
            className="group ml-auto block w-fit text-right focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            data-slot="next-project"
            href={`/projects/${nextProject.slug}`}
          >
            <span className="block font-mono text-xs uppercase tracking-route-kicker text-muted-foreground">
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
