import Link from "next/link";

/**
 * Renders the project-family fallback for an unknown slug.
 *
 * @returns The project not-found page.
 */
export default function ProjectNotFound() {
  return (
    <main>
      <h1>Project not found</h1>
      <p>The project you requested does not exist.</p>
      <Link href="/projects">View all projects</Link>
    </main>
  );
}
