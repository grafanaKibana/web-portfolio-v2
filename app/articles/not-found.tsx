import { NotFoundPage } from "@/components/not-found-page/not-found-page";

/**
 * Renders the article-family fallback for an unknown slug.
 *
 * @returns The article not-found page.
 */
export default function ArticleNotFound() {
  return (
    <NotFoundPage
      title="Article not found"
      description="The article you requested does not exist."
      href="/articles"
      linkLabel="View all articles"
    />
  );
}
