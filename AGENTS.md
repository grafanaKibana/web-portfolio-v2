<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project architecture

Use a **route-oriented vertical-slice modular monolith**. Keep the implementation recognizable through ownership and dependency rules, not additional application layers.

## Ownership and dependencies

- Route entries own routing, metadata, Server Component composition, static parameters, and not-found decisions.
- Keep route-specific rendering, content mapping, interactions, styles, and tests with their route slice.
- Keep application-shell implementation in named component folders under `app/_shell`; keep Home implementation under `app/(home)/_components`.
- `app/(home)` is the only route group and has no layout; `app/layout.tsx` remains the sole application layout.
- Route slices may import shared modules. Shared modules must not import route internals, and sibling slices must not import one another's private modules.
- Promote code to shared only after two real consumers exist or when the concern is intrinsically application-wide.
- Prefer small duplication to speculative abstractions.
- Do not introduce repository, service, use-case, domain, adapter, dependency-injection, registry, plugin, global-state, or design-system layers without a concrete approved requirement.

## Server and client boundaries

- Pages, layouts, static UI, structured content, metadata, and MDX remain Server Components by default.
- Add `"use client"` only for state, effects, event handlers, custom hooks, or browser APIs.
- Approved client entries are `app/_shell/theme/theme.tsx`, `app/_shell/mobile-navigation/mobile-navigation.tsx`, `app/_shell/opening-splash/opening-splash.tsx`, `app/_shell/page-motion/page-motion.tsx`, `app/_shell/local-time/local-time.tsx`, `app/(home)/_components/descriptor-rotation/descriptor-rotation.tsx`, and `app/(home)/_components/contact-form/contact-form.tsx`.
- Client modules may receive serializable props and browser-safe shared UI. They must not import `server-only`, Node filesystem/path APIs, MDX discovery, secrets, or server content loaders.
- Prefer native HTML and CSS before JavaScript: `details/summary` for disclosures, native form validation, and CSS reduced-motion handling.
- Keep server-rendered content meaningful without hydration. Client decoration must fail open and must never block, hide, or inert core content.
- Page motion is shared progressive enhancement: each route's intro targets enter from an armed splash handoff, and each marked row reveals once after crossing the 90% viewport line. Rows entering together cascade in document order; explicit nested items may stagger within a row. Cells, controls, and icons remain static.

## Content, routing, and assets

- Keep structured portfolio data as typed TypeScript records independent of React components.
- Treat local repository-authored MDX as trusted executable source. Do not add remote or user-provided MDX without a new security decision.
- Discover MDX with Node standard-library APIs, validate normalized slugs, reject case-insensitive duplicates, and runtime-validate module metadata imported as `unknown`.
- Article and project routes must use `generateStaticParams` with `dynamicParams = false`; unknown slugs return a static 404 with `noindex`.
- Invalid known content fails validation/build with source-specific diagnostics. Optional activity data fails open and cannot delay or remove curated content.
- Keep production assets local. Do not depend on prototype CDN URLs or fabricate biography, activity, credential, canonical-origin, or project facts.
- Resolve sitemap and robots URLs only from a validated HTTPS deployment origin; do not invent a fallback domain.

## Accessibility and interaction

- Preserve semantic HTML, keyboard operation, visible focus, Escape behavior, focus trapping and return, reduced motion, and usable no-JavaScript fallbacks.
- The mobile navigation remains modal and restores focus to its trigger.
- The opening splash remains decorative, `aria-hidden`, non-focusable, pointer-transparent, and terminal on readiness success or failure.
- Contact remains a native-validating `mailto:` flow unless a backend is explicitly approved.
- Use standard Tailwind utilities before adding custom CSS. Keep component-specific custom CSS in its colocated module only when Tailwind has no close utility, and promote repeated custom styling to a named reusable utility.

## Documentation and tests

- Give every named class and function a concise TSDoc comment that explains purpose or non-obvious logic. Do not restate the signature or add comments to anonymous callbacks and obvious inline lambdas.
- Use singular `@param name - description` for each runtime parameter, `@returns` only when a function produces a value, `@typeParam name - description` for each named generic parameter, and `@throws` only for meaningful failure contracts. TypeScript signatures own type information; do not duplicate types in tags.
- Use `@remarks` only when the summary cannot hold essential behavior, `@see` only for a useful related API or resource (with `{@link}` for hyperlinks), `@example` only for genuinely non-obvious usage, and `@deprecated` only with a supported replacement.
- Keep summaries under 160 characters and all comments current and behavior-focused; update or remove them with the implementation they describe.
- All automated tests live under `tests/`. Browser specifications live under `tests/e2e/`; documentation checks also live under `tests/`.
- Add the smallest regression that proves non-trivial branches, parsers, trust boundaries, accessibility behavior, or architecture constraints.
- Test public contracts and observable behavior; avoid coupling tests to private implementation details.

## Verification and workspace hygiene

Run checks proportional to the change. Before completing architecture, content, or interaction work, run:

```bash
npm run lint
npm run typecheck
npm run test:content
npm run test:contrast
npm run test:documentation
npm run test:seo
npm run build
npm run test:e2e
git diff --check
git status --short
```

- `npm run test:e2e` owns its temporary production server on port 3192. Confirm it stops after the run; do not stop unrelated listeners.
- Preserve unrelated staged, untracked, generated, IDE, and design work. Edit and stage only named task files.
- Report scoped passes separately from unrelated baseline failures; never claim a full pass without fresh evidence.
- Add dependencies only for an approved requirement after framework, platform, standard-library, and installed options are insufficient.
