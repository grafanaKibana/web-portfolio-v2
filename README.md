# Nikita Reshetnik Portfolio

Next.js portfolio with typed structured content and repository-authored MDX.

## Commands

```bash
npm run dev
npm run lint
npm run typecheck
npm run test:content
npm run test:contrast
npm run test:documentation
npm run test:seo
npm run check:architecture
npm run build
npm run test:e2e
```

All automated tests live under `tests/`; browser specifications are grouped in `tests/e2e/`.

## Directory map

| Path | Responsibility |
| --- | --- |
| `app/layout.tsx` | Sole root layout and document composition; owns the global skip link. |
| `app/_shell/` | Application-wide header, footer, theme, navigation, splash, and local-time components. |
| `app/(home)/page.tsx` | `/` route entry; `(home)` organizes files without adding a URL segment. |
| `app/(home)/_components/` | Private Home sections and interactions, each in a named folder with colocated SCSS when needed. |
| `app/articles/`, `app/projects/` | Route slices that own their pages, metadata, static parameters, and private rendering. |
| `app/robots.ts`, `app/sitemap.ts` | Next.js metadata handlers; they remain at the `app` root because the framework defines their location. |
| `content/` | Typed structured records and trusted repository-authored MDX. |
| `tests/` | Architecture, documentation, content, SEO, contrast, and browser contracts. |

`layout.tsx` wraps routes with shared UI; a `page.tsx` exposes the route for its folder. Private `_components` folders are not routes. The only route group is `(home)`, and it deliberately has no layout so `app/layout.tsx` remains authoritative for every page.

Pages, layouts, and static sections stay Server Components. Exactly six interaction leaves allow `use client`: theme, mobile navigation, opening splash, local time, descriptor rotation, and the preserved future contact form. Article and project loaders discover local MDX with Node APIs, validate slugs and module metadata, then use the approved fixed-prefix, explicit-suffix dynamic import documented in the project brief.

Set `NEXT_PUBLIC_SITE_URL` to the deployed HTTPS origin (for example, `https://portfolio.example.com`). Vercel deployments may use `VERCEL_PROJECT_PRODUCTION_URL` instead. Without either value, local builds keep `robots.txt` valid and publish an empty sitemap rather than inventing a production domain.
