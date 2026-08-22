import type { Metadata } from "next";
import Link from "next/link";

import { loadProjects } from "@/content/projects/server";

export const metadata: Metadata = {
  title: "Projects",
  description: "Projects by Nikita Reshetnik across AI and software engineering.",
};

/**
 * Loads and renders the statically discovered project listing.
 *
 * @returns The project listing page.
 */
export default async function ProjectsPage() {
  const projects = await loadProjects();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-20">
      <header className="max-w-2xl">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Selected work
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">Projects</h1>
        <p className="mt-5 text-lg leading-8 text-muted-foreground">
          Software, learning systems, and applied AI work.
        </p>
      </header>

      <ul className="mt-14 divide-y">
        {projects.map(({ slug, metadata: project }) => (
          <li key={slug}>
            <article className="py-8">
              {project.tags?.length ? (
                <p className="font-mono text-xs text-muted-foreground">
                  {project.tags.join(" · ")}
                </p>
              ) : null}
              <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                <Link
                  className="underline-offset-4 hover:text-primary-text hover:underline"
                  href={`/projects/${slug}`}
                >
                  {project.title}
                </Link>
              </h2>
              <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">
                {project.description}
              </p>
            </article>
          </li>
        ))}
      </ul>
    </main>
  );
}
