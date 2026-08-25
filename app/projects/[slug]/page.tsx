import { Github, Obsidian } from "@thesvg/react";
import { clsx } from "clsx";
import { ArrowLeft, ExternalLink, House } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import headerStyles from "@/app/_shell/site-header/site-header.module.scss";
import { ThemeToggle } from "@/app/_shell/theme/theme";
import { getProjectSlugs, loadProject } from "@/content/projects/server";
import { home } from "@/content/structured";

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

  return (
    <>
      <header className={clsx(headerStyles.header, "sticky top-0 z-50")} data-slot="project-header">
        <nav
          aria-label={home.projects.navigationLabel}
          className={clsx(headerStyles.navigation, headerStyles.projectNavigation, "mx-auto h-full w-full items-center")}
        >
          <div className="flex items-center">
            <Link
              aria-label={home.projects.backLabel}
              className="inline-flex size-11 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 xl:size-8"
              href="/projects"
            >
              <ArrowLeft aria-hidden="true" className="size-ui-icon opacity-70" />
            </Link>
            <Link
              aria-label={home.projects.homeLabel}
              className="inline-flex size-11 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 xl:size-8"
              href="/"
            >
              <House aria-hidden="true" className="size-ui-icon opacity-70" />
            </Link>
          </div>
          <span aria-hidden="true" />
          <div className="justify-self-end">
            <ThemeToggle labels={home.theme} />
          </div>
        </nav>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 px-6 py-12 focus:outline-none lg:py-20">
        <article className="max-w-3xl">
          <header className="border-b pb-10" data-slot="project-hero">
            <h1 className="text-4xl font-semibold tracking-tight">{project.metadata.title}</h1>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              {project.metadata.description}
            </p>
            {project.metadata.tags?.length ? (
              <p className="mt-6 font-mono text-xs text-muted-foreground">
                {project.metadata.tags.join(" · ")}
              </p>
            ) : null}
            {project.metadata.links?.length ? (
              <div className="mt-4 flex flex-wrap items-center gap-x-6" data-slot="project-actions">
                {project.metadata.links.map((link) => (
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
              </div>
            ) : null}
          </header>

          <div className="pt-6">
            <project.Content />
          </div>
        </article>
      </main>
    </>
  );
}
