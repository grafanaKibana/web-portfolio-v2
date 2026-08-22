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

Pages and layouts stay Server Components; only the five interaction leaves allow `use client`. Article and project loaders discover local MDX with Node APIs, validate slugs and module metadata, then use the approved fixed-prefix, explicit-suffix dynamic import documented in the project brief.

Set `NEXT_PUBLIC_SITE_URL` to the deployed HTTPS origin (for example, `https://portfolio.example.com`). Vercel deployments may use `VERCEL_PROJECT_PRODUCTION_URL` instead. Without either value, local builds keep `robots.txt` valid and publish an empty sitemap rather than inventing a production domain.
