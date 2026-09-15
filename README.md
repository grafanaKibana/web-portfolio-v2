# Nikita Reshetnik Portfolio

Next.js portfolio with validated structured content and repository-authored MDX.

## Commands

```bash
npm run dev
npm run typecheck
npm run lint
npm run test:unit
npm run test:content
npm run test:contrast
npm run test:documentation
npm run test:seo
npm run test:plugin-links
npm run test:descriptor
npm run test:brand-assets
npm run build
npm run test:e2e
```

`test:unit` discovers neutral tests as `*.test.*` and server-only tests as `*.server.test.*`. Focused commands remain available for a single contract. Build the production application before running Playwright directly; its configuration owns the temporary server on port 3192. `npm run test:e2e:dev` checks the shared style contracts against Turbopack development mode on port 3193, because CSS ordering can differ from the production build.

Code activity pull-request rows require a server-only `GITHUB_TOKEN` deployment secret. Without it, the independently fetched public contribution calendar can still render. Never expose the token with a `NEXT_PUBLIC_` prefix.

Plugin links on case studies use Obsidian's official download statistics and each source repository's latest stable GitHub release for their labels. Home keeps its authored store/source labels. Data refreshes on demand after a day in the server cache; unavailable data retains the original labels and destinations.

## Directory map

| Path | Responsibility |
| --- | --- |
| `app/` | Next.js route entries, metadata handlers, and route-private implementation. |
| `app/(home)/page.tsx` | `/` route entry; `(home)` groups source without changing the URL. |
| `app/(home)/_components/` | Home-private UI owners and their companions. |
| `app/projects/[slug]/_lib/` | Non-UI implementation private to project detail routes. |
| `components/` | Application-wide shared UI, including the site frame and reusable controls. |
| `components/ui/` | Shared UI foundation and its local generator utility adapter. |
| `lib/` | Application-wide shared non-UI runtime code. |
| `lib/content/` | Content discovery, loading, validation, and shared content types. |
| `lib/seo/` | Shared URL and metadata-route builders. |
| `content/` | Authored YAML and MDX; no runtime TypeScript. |
| `public/` | Framework-served static assets. |
| `tests/` | Repository-wide quality checks and browser workflows under `tests/e2e/`. |

`app/layout.tsx` is the sole root layout. A `page.tsx` or `route.ts` exposes a route; colocated implementation files do not. Underscore folders mark route-private implementation. Root `components/` and `lib/` are the shared application scopes. Do not create duplicate `app/_components/` or `app/_lib/` shared folders.

## Placement rule

Put a file at the narrowest owner that fully owns its behavior. Promote it only when a real consumer outside that owner appears.

1. Used by one component? Keep it in that component folder.
2. Used by multiple components in one route? Put it at their nearest route-private common scope.
3. Used by multiple routes? Put UI in root `components/`; put non-UI runtime code in root `lib/`.
4. Required by Next.js? Keep the special file at its framework location.
5. Authored content or a public asset? Keep it in `content/` or `public/`; runtime readers belong in `lib/` or the route that exclusively consumes them.

Next.js supports multiple project organizations. This repository chooses root shared folders plus route-private colocation and applies that choice consistently.

### Examples

- Hero-only behavior stays under `app/(home)/_components/hero/`. Descriptor sequencing lives inside `hero/descriptor-rotation/` because no other owner consumes it.
- Projects and Writing both use the Home editorial row, so it lives at their Home-private common owner: `app/(home)/_components/editorial-row/`.
- Project content is consumed by Home and project routes, so its loader lives at `lib/content/projects/server.ts`, while authored project MDX remains in `content/projects/`.

## Imports and boundaries

Use relative imports within one owner. Use the existing `@/` alias when crossing owners. Import the public component entry, never another owner's private companion.

| Allowed | Forbidden |
| --- | --- |
| Hero entry → its descriptor companion | About → Hero descriptor companion |
| Home route → Home component entry | One route → a sibling route's private implementation |
| Home or project route → `@/lib/content/...` | Root `components/` or `lib/` → route-private code |
| Site component → shared `lib/` helper | `components/ui/` → route workflows or content readers |
| UI primitive → another UI primitive | Production code → colocated tests or `tests/` |

ESLint checks resolved TypeScript and JavaScript import zones, including aliases, relative imports, re-exports, type imports, and supported literal dynamic imports. It does not infer business ownership for a new folder. Adding a route, root component owner, or private component owner requires a reviewed zone plus allowed and forbidden fixtures in `tests/eslint-boundaries.test.mjs`.

MDX and SCSS internals are reviewed against the same ownership rules but are outside TypeScript import-zone coverage. The production build verifies MDX bundling. Next.js compilation and explicit `server-only` guards verify the server/client graph.

## Test ownership

- Unit and module integration tests live beside their subject as `*.test.ts`, `*.test.tsx`, or `*.test.mjs`.
- A test importing a `server-only` subject uses `*.server.test.*` and runs with React server conditions.
- Cross-cutting documentation, contrast, and import-boundary checks stay under `tests/`.
- Browser workflows stay under `tests/e2e/`.
- Production modules never import tests. Tests may import their production subjects.

Use synthetic fixtures and controlled responses. Tests must not depend on current portfolio wording, identities, dates, counts, inventory, or live services.

## Shared UI generation

`components.json` points shadcn at root `components/`, `components/ui/`, `lib/`, and the local `components/ui/utils.ts` adapter. Registry templates can still differ from this repository's Base UI conventions or import `cn` directly. Review every generated diff before adoption; do not overwrite existing controls or assume generator aliases rewrite all upstream source.
