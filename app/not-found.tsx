import { NotFoundPage } from "@/components/not-found-page/not-found-page";

/**
 * Renders the application fallback for an unmatched URL.
 *
 * @returns The root not-found page.
 */
export default function NotFound() {
  return (
    <NotFoundPage
      title="Page not found"
      description="The page you requested does not exist."
      href="/"
      linkLabel="Return home"
    />
  );
}
