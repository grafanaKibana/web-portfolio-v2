# Design

## Source of truth

- Status: Active
- Last refreshed: 2026-08-24
- This document explains the intended look, feel, and design behavior. It is not a token registry and does not depend on `design/` to remain complete or available.
- Authority is divided by domain: code owns every exact design token and implementation value; `DESIGN.md` owns qualitative design direction; `AGENTS.md`, application code, and tests govern technical behavior, accessibility, architecture, and safety; validated records and local MDX under `content/` govern production facts.
- Optional supporting snapshots and evidence inspected during authoring include `design/Home Desktop.dc.html`, `design/Home Mobile.dc.html`, `design/Project Case Study.dc.html`, `design/Article.dc.html`, `design/States and System.dc.html`, and `design/_ds/`. They are not live dependencies or governing authority. `design/github.md` is historical provenance inspected during authoring and is currently absent; it is not an active source dependency.
- Prototype copy and remote CDN assets are illustrative, not production facts or dependencies. Global tokens and base rules belong in `app/globals.css`; component values belong in Tailwind utilities or a colocated `*.module.scss` file when custom CSS is necessary. Tests including `tests/e2e/interactions.spec.ts` govern observable behavior.
- Token-value changes alone do not require a documentation update. Refresh this document only when the qualitative direction, token ownership, behavior, or constraints change.

## Brand

- A minimal editorial portfolio: direct, technically credible, calm, and personal without becoming promotional.
- Let typography, open whitespace, thin dividers, and carefully ordered evidence carry the identity.
- Use emerald as a restrained signal, not decoration.
- Avoid dashboard, bento, card-grid, SaaS-shell, marketing-gradient, glass, and component-showcase aesthetics.

## Product goals

- Make identity, experience, selected projects, writing, code activity, and contact paths easy to scan and inspect in depth.
- Support hiring, peer evaluation, and professional contact with factual, accessible evidence.
- Keep curated work available when JavaScript, optional activity data, animation, or a mail client is unavailable.
- Non-goals: social feed, analytics dashboard, CMS, remote-content platform, or generic design-system product.
- Assumed success signals: visitors can identify role and strengths, reach a relevant project or article, and find a contact route without assistance. No analytics or user research currently validates these signals.

## Personas and jobs

- Assumption — hiring reviewers: establish fit quickly, then inspect role history, outcomes, and representative work.
- Assumption — engineering peers or collaborators: assess technical depth through case studies, writing, and source links.
- Assumption — prospective contacts: understand the person and open a reliable contact path.
- Key contexts: fast desktop review, tablet reading, one-handed mobile scanning, keyboard navigation, reduced motion, and no-JavaScript browsing.

## Information architecture

- `/`: editorial overview with hero, About, Experience, Education, Skills, Selected work, Code activity, Writing, and Contact anchors.
- `/projects` and `/projects/[slug]`: project index and evidence-led case studies.
- `/articles` and `/articles/[slug]`: writing index and long-form articles.
- Unknown project and article slugs resolve to static, noindex 404s.
- Desktop navigation exposes primary destinations inline. Compact layouts use a modal section/navigation sheet; long-form routes provide a clear back link and next-item path.
- Order content from identity and relevance to proof and contact. Metadata stays secondary and in flow; it does not become dashboard chrome.
- About pairs the biography with two quiet career-chapter summaries. Experience begins directly with the timeline and does not repeat those summaries.

## Design principles

- Editorial before interface: lead with readable content, not containers or controls.
- Evidence before claims: show verified roles, outcomes, work, dates, and links; omit what is unavailable.
- One hierarchy: headings, mono metadata, spacing, and full-measure rules establish structure without boxed section wrappers.
- Progressive by default: semantic HTML and server-rendered content remain useful before hydration; optional behavior must fail open.
- Restraint over novelty: one accent hue, few radii, minimal elevation, and short purposeful motion.

## Visual language

- Color: use a quiet neutral foundation with strong text contrast, subdued secondary text, and understated dividers. Dark mode should preserve the same hierarchy rather than becoming a separate visual theme. Exact colors come from code tokens.
- Accent use: descriptor rule, current timeline dot, merged status, article pull-quote rule, and selection. No accent fills or gradients.
- Typography: use a confident sans-serif for display, headings, and prose, with a monospaced secondary voice for dates, counts, code, and numbered labels. The hero should feel expressive, section headings clear, body copy comfortable, and metadata deliberately quiet. Exact families, sizes, weights, tracking, and line heights come from code tokens.
- Measure and rhythm: favor generous outer whitespace, narrow readable prose, clear pauses between sections, and tighter spacing inside related content groups. Long-form pages should feel focused rather than stretched. Exact widths, gutters, and spacing come from code tokens.
- Shape and depth: keep page surfaces flat, use dividers for structure, and reserve radius or shadow for controls and overlays that need affordance or separation. Shadows use neutral-black alpha in both themes and never derive elevation from foreground or other light colors. Sections are not cards.
- Iconography: use Lucide interface icons with consistent outline weight and restrained prominence. Technology and brand marks are the official monochrome assets, inverted where needed in dark mode; no emoji, filled, or two-tone substitutes. Exact icon sizing comes from code tokens.
- Motion: keep transitions brief, subtle, and purposeful. Movement should clarify readiness, disclosure, navigation, or state change without becoming a visual event; action icons may use a small directional shift on hover while reduced-motion users see no translation. Nothing parallaxes or animates on scroll; exact timing and easing come from code tokens.

## Components

- Reuse the application shell under `app/_shell`, Home sections and interactions under `app/(home)/_components`, native disclosure, route lists, and MDX typography before adding markup.
- Preserve native `details`/`summary` for experience disclosure and native form controls/validation for contact.
- Reuse semantic tokens from `app/globals.css`; raw `design/_ds/` primitives do not mandate shadcn components or a new design-system layer.
- Keep `app/globals.css` limited to Tailwind imports, application-wide tokens, base element rules, and named utilities with at least two real consumers. Component-specific selectors, keyframes, states, and responsive rules must live in a scoped SCSS module beside their owning component.
- Do not use Tailwind arbitrary-value or arbitrary-variant syntax in component markup. Use the closest standard utility when it stays within 5% of the approved design, a colocated SCSS module for a one-off customization, or a named reusable utility when the same customization has multiple consumers.
- Keep route-specific section, index, article, and case-study rendering within its route slice. Home uses the URL-neutral `(home)` route group; its private components live in named folders with colocated SCSS. Promote a shared component only after two real consumers or for an intrinsically application-wide concern.
- Required states belong to the owning component: default, hover, focus-visible, active/open, invalid, disabled, loading/readiness, success, and unavailable where relevant.

## Accessibility

- Assumption — target standard: WCAG 2.2 AA. Confirm formal conformance scope and audit ownership before claiming compliance.
- Use semantic landmarks, ordered headings, real links/buttons, labeled form controls, meaningful alternative text, and decorative icons hidden from assistive technology.
- Preserve visible focus, full keyboard operation, and adequate target sizes. Modal navigation traps focus, closes with Escape, and returns focus to its trigger.
- Maintain AA contrast for text, controls, dividers that convey meaning, focus indicators, and light/dark themes; do not rely on emerald or motion alone to communicate state.
- Keep readable line lengths and allow text reflow/zoom without clipped content or horizontal page scrolling; code blocks may scroll locally.
- Under reduced motion, remove translation and pulsing, cross-fade the descriptor in place, and show a static splash. Maintain usable no-JavaScript fallbacks.

## Responsive behavior

- Desktop: use generous side whitespace, inline primary navigation, expressive hero typography, multi-column editorial compositions, and a distinct experience date rail.
- Tablet: reduce unused side space, open compact navigation as a content-height blurred extension below the header, compress supporting rails, and retain split layouts only while they remain comfortably readable.
- Mobile: use a compact header whose section selector opens the same content-height blurred extension below it, comfortable page edges, a focused hero, single-column reading flow, and stacked metadata and actions. When four social links cannot stay on one line, lay them out as two balanced rows of two rather than leaving an orphan link.
- About uses equal biography and career-chapter columns separated by a divider on desktop, then stacks biography, chapters, and facts in that order on mobile.
- Adapt hierarchy rather than scaling the desktop canvas: preserve reading order, move side metadata into flow, stack split layouts, and keep controls reachable without hover.
- Exact breakpoints, dimensions, and responsive type or spacing values come from code tokens and must not be duplicated here.

## Interaction states

- Splash: decorative, pointer-transparent, non-focusable, readiness-driven, light/dark aware, terminal on success or failure, static for reduced motion, absent as a blocker under no-JavaScript.
- Navigation: transparent/quiet at rest, separated by a border when scrolled; keep the closed compact selector unchanged while its content-height phone and tablet sheet shares one continuous background, typography, color, width, and flat styling with the open header. Omit a redundant visible menu title, and replace the header theme control with the dialog close control while open. Preserve the blurred backdrop, selected-section state, Escape, focus containment, and focus return without a floating-modal treatment.
- Disclosure: collapsed and expanded in document flow with native keyboard semantics; avoid overlaying or hiding its content.
- Contact: empty, focused, invalid, ready, and native mail-app handoff states. Keep the direct `mailto:` address as fallback; do not imply server delivery.
- Optional activity: show a visualization only when cached data resolves. On empty, error, slow, or offline states, keep curated links/content and render no broken or empty frame.
- Content collections: omit unavailable optional fields; provide a quiet empty explanation only when an entire index has no entries.
- Errors: invalid known content fails validation/build; unknown routes use the relevant static 404 with a route back to valid content.
- Success and disabled: acknowledge completed local actions without celebratory decoration; disabled controls remain visibly unavailable and are not the sole route to core content.

## Content voice

- Write as a concise technical peer: specific, calm, factual, and editorial rather than sales-led.
- Prefer concrete responsibilities, outcomes, technologies, and dates to adjectives or self-ratings.
- Use sentence case, short labels, active verbs, and unrounded factual values. Avoid hype, fake urgency, generic endorsements, emoji, and invented metrics.
- Production biography, activity, credentials, canonical origin, projects, articles, dates, and links must come from `content/` or another explicitly validated local source. Omit unavailable facts rather than displaying placeholders or borrowing illustrative canvas copy.

## Implementation constraints

- Preserve the route-oriented vertical-slice modular monolith: routes own routing, metadata, Server Components composition, static parameters, not-found decisions, route rendering, and route tests.
- Server Components remain the default. The exact client entries are `app/_shell/theme/theme.tsx`, `app/_shell/mobile-navigation/mobile-navigation.tsx`, `app/_shell/opening-splash/opening-splash.tsx`, `app/_shell/local-time/local-time.tsx`, `app/(home)/_components/descriptor-rotation/descriptor-rotation.tsx`, and `app/(home)/_components/contact-form/contact-form.tsx`.
- `app/layout.tsx` is the sole application layout. `app/(home)/page.tsx` owns `/`, and the `(home)` group has no layout or URL segment.
- Keep structured portfolio data as typed TypeScript records and local repository-authored MDX as trusted executable content. Validate imported metadata, normalized slugs, and case-insensitive duplicates.
- Project and article detail routes use static parameters with dynamic params disabled; optional activity cannot delay or remove curated content.
- Prefer native HTML and CSS to JavaScript. Server-rendered content remains meaningful before hydration; client decoration must fail open.
- Contact remains a native-validating `mailto:` flow unless a backend is explicitly approved.
- Use local production assets. Remote prototype fonts, icons, images, and CDN URLs are illustrative delivery evidence only.
- Reuse existing components and token ownership. All exact design values remain in code; do not synchronize them into this document. Do not add a dependency, registry, global state, component library, or design-system abstraction for this direction.
- Use an existing Tailwind utility whenever it reproduces the reference within a 5% visual tolerance. Keep one-off custom values in the owning component's `*.module.scss`; promote a value to a named global utility only when a second real consumer exists.

## Open questions

- [ ] Validate the assumed hiring-reviewer, engineering-peer, and prospective-contact personas with actual audience research; impact: prioritization and language, not current architecture.
- [ ] Define measurable success signals and whether privacy-preserving analytics are wanted; impact: evaluation only, not permission to add tracking.
- [ ] Confirm the WCAG 2.2 AA audit scope, supported browser matrix, and named owner before making a formal conformance claim.
- [ ] Confirm which illustrative canvas copy and assets, if any, have been validated into `content/`; until then, production must omit them.
