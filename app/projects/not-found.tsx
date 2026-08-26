import Link from "next/link";

/**
 * Renders the project-family fallback for an unknown slug.
 *
 * @returns The project not-found page.
 */
export default function ProjectNotFound() {
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto w-full max-w-3xl flex-1 px-6 py-12 focus:outline-none lg:py-20"
    >
      <h1 className="text-4xl font-semibold tracking-tight">Project not found</h1>
      <p className="mt-5 leading-7 text-muted-foreground">
        The project you requested does not exist.
      </p>
      <Link
        className="mt-8 inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        href="/projects"
      >
        View all projects
      </Link>
    </main>
  );
}
