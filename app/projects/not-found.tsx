import { NotFoundPage } from "@/components/not-found-page/not-found-page";

/**
 * Renders the project-family fallback for an unknown slug.
 *
 * @returns The project not-found page.
 */
export default function ProjectNotFound() {
  return (
    <NotFoundPage
      title="Project not found"
      description="The project you requested does not exist."
      href="/projects"
      linkLabel="View all projects"
    />
  );
}
