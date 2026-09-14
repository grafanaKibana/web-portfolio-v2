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
npm run build
npm run test:e2e
```

All automated tests live under `tests/`; browser specifications are grouped in `tests/e2e/`.

Code activity pull-request rows require a server-only `GITHUB_TOKEN` deployment secret. Without it, the independently fetched public contribution calendar can still render; never expose the token with a `NEXT_PUBLIC_` prefix.

Plugin links on case studies use Obsidian's official download statistics and each source repository's latest stable GitHub release for their labels. Home keeps its original store/source labels. Data refreshes on demand after a day in the server cache; link destinations remain unchanged and unavailable data retains the original labels. Run the focused data checks with `NODE_OPTIONS=--conditions=react-server npx tsx --test tests/plugin-links.test.ts`.

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
| `tests/` | Documentation, content, SEO, contrast, and browser contracts. |

`layout.tsx` wraps routes with shared UI; a `page.tsx` exposes the route for its folder. Private `_components` folders are not routes. The only route group is `(home)`, and it deliberately has no layout so `app/layout.tsx` remains authoritative for every page.
