import Link from "next/link";

interface NotFoundPageProps {
  title: string;
  description: string;
  href: string;
  linkLabel: string;
}

/**
 * Renders the shared not-found layout with route-specific copy and return navigation.
 *
 * @param title - Heading for the missing page.
 * @param description - Explanation shown below the heading.
 * @param href - Destination of the return link.
 * @param linkLabel - Accessible text for the return link.
 * @returns The not-found page.
 */
export function NotFoundPage({ title, description, href, linkLabel }: NotFoundPageProps) {
  return (
    <main
      id="main"
      tabIndex={-1}
      className="page-shell-gutter w-full flex-1 py-12 focus:outline-none lg:py-20"
    >
      <h1 className="text-4xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-5 leading-7 text-content-foreground">{description}</p>
      <Link
        className="mt-8 inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        href={href}
      >
        {linkLabel}
      </Link>
    </main>
  );
}
