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

  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 px-6 py-20 focus:outline-none">
      <article className="max-w-3xl">
        <header className="border-b pb-12">
          <Link
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            href="/projects"
          >
            All projects
          </Link>
          <p className="tracking-route-kicker mt-8 font-mono text-xs uppercase text-muted-foreground">
            Case study
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            {project.metadata.title}
          </h1>
          <p className="mt-6 text-lg leading-8 text-muted-foreground">
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
    </main>
  );
}
