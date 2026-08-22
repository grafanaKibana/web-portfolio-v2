import Link from "next/link";

/**
 * Renders the article-family fallback for an unknown slug.
 *
 * @returns The article not-found page.
 */
export default function ArticleNotFound() {
  return (
    <main>
      <h1>Article not found</h1>
      <p>The article you requested does not exist.</p>
      <Link href="/articles">View all articles</Link>
    </main>
  );
}
