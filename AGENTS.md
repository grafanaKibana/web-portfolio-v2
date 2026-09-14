# Agent guide

This repository is Nikita Reshetnik's portfolio, built with Next.js App Router, React, TypeScript, Tailwind CSS, SCSS modules, and local MDX.

## Start here

- Read [README.md](README.md) for the directory map and [package.json](package.json) for installed versions and available commands.
- Follow [DESIGN.md](DESIGN.md) for design intent, content voice, and interaction behavior. Code owns exact visual values; validated records and MDX under `content/` own portfolio facts.
- Read the relevant installed Next.js guidance before changing framework behavior. Keep documentation aligned with changes to its owned contracts.

## Working agreements

- Complete clear, reversible work autonomously. Ask when a material decision is unresolved or an action is destructive.
- Inspect the working tree before editing. Preserve unrelated staged, unstaged, untracked, and generated work; never reset or revert it to simplify a task.
- Reuse existing code, native platform APIs, and installed packages before adding abstractions. Ask before adding any new dependency, including development dependencies.
- Keep changes scoped to the request. Use native subagents for independent, bounded work when useful; assign ownership and verify the integrated result.
- For refactoring, write a bounded plan and establish coverage for relevant invariants and edge cases before changing behavior-sensitive code.

## Ownership and boundaries

Use a route-oriented vertical-slice modular monolith: organize by route and feature without speculative layers.

- Route entries own routing, metadata, page composition, static parameters, and not-found decisions. Keep feature rendering, interactions, and styles together.
- `app/layout.tsx` owns document composition and the shared shell. Application-wide features live under `app/_shell/`; Home features live under `app/(home)/_components/`.
- Keep route-specific implementation private to its route. Shared modules must not import route internals, and sibling routes must not import each other's private implementation.
- Share code when it has multiple real consumers or an application-wide responsibility. Prefer small duplication over a speculative abstraction.
- Keep rendering on the server by default. Add narrow client boundaries for state, effects, event handlers, or browser APIs; pass serializable props across them.
- Keep server-only loaders, Node filesystem APIs, credentials, and provider code out of client modules.

## Shared UI and styling

- Shared UI components, including shadcn source under `components/ui/`, may be edited directly. Keep them reusable; put feature-specific behavior in its owning feature and verify affected consumers when shared behavior changes.
- Prefer existing component APIs, semantic tokens, and standard Tailwind utilities when they fit. Use colocated SCSS modules for feature styling; shared visual tokens belong in `app/globals.css`.
- Review upstream component updates against local changes before replacing source.

## Content and server behavior

- Keep structured content independent of rendering code and validate it at load boundaries. Never invent biography, credentials, activity, project claims, or deployment origins. Keep production assets local.
- Treat repository-authored MDX as trusted executable source. Remote or user-provided MDX requires a separate security decision.
- Validate normalized slugs, reject case-insensitive duplicates, and validate imported metadata as `unknown`. Invalid known content must fail with source-specific diagnostics.
- Article and project detail routes use `generateStaticParams` and `dynamicParams = false`; unknown slugs return a static 404 with `noindex`.
- Optional activity or plugin metadata failures must not remove curated content. Sitemap and robots URLs require a validated HTTPS deployment origin.

## Accessibility and interaction

- Preserve semantic HTML, keyboard operation, visible focus, accessible names, and appropriate Escape and focus-return behavior. Modal interactions must retain focus trapping.
- Prefer native HTML and CSS when they meet the interaction requirements. Keep useful content and navigation available without JavaScript.
- Respect reduced motion. Decorative splash and animation must never trap focus or permanently hide content when setup fails.
- Verify visual changes in rendered light/dark and mobile/desktop states, including affected keyboard, reduced-motion, fallback, and error behavior. Source inspection alone is not visual verification.

## TSDoc

- TSDoc is mandatory for all repository-authored code, including shared UI customizations. Document named functions, classes, and other authored API declarations with concise, behavior-focused descriptions.
- Imported third-party source is exempt. Local additions or rewritten declarations need TSDoc even inside an imported file; importing a local module does not exempt our own code. Do not bulk-document untouched third-party source.
- Keep summaries under 160 characters. Use `@param name - description` for runtime parameters, `@typeParam` for named generics, `@returns` for produced values, and `@throws` for meaningful failure contracts.
- Keep comments current. Explain purpose and contracts without restating TypeScript signatures or adding commentary to every statement or obvious anonymous callback.

## Verification

- Focus tests on core generic invariants and meaningful edge cases for the affected behavior. Prefer reusable cases that exercise the same contract across inputs; avoid implementation-mirroring assertions and redundant scenario tests.
- Run the smallest relevant checks that establish those invariants. There is no blanket requirement to run the full test suite, production build, or all browser tests. Use additional checks only to resolve a concrete validation need.
- Keep automated tests under `tests/` and browser specifications under `tests/e2e/`. Use existing commands from `package.json`; documentation-only changes need reference, consistency, and diff checks.
- When browser tests are needed, build their production prerequisite first. The Playwright configuration owns its temporary server on port 3192; confirm it stops afterward without stopping unrelated listeners.
- Finish with `git diff --check` and `git status --short`. Report what changed, the checks actually run, and any remaining gaps. Separate task failures from existing baseline failures.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
