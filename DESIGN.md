# Design

## Source of truth

- Status: Active
- Last refreshed: 2026-08-29
- This document explains the intended look, feel, and design behavior. It is not a token registry and does not depend on `design/` to remain complete or available.
- Authority is divided by domain: code owns every exact design token and implementation value; `DESIGN.md` owns qualitative design direction; `AGENTS.md`, application code, and tests govern technical behavior, accessibility, architecture, and safety; validated records and local MDX under `content/` govern production facts.
- Optional supporting snapshots and evidence inspected during authoring include `design/Home Desktop.dc.html`, `design/Home Mobile.dc.html`, `design/Project Case Study.dc.html`, `design/Article.dc.html`, `design/States and System.dc.html`, and `design/_ds/`. They are not live dependencies or governing authority. GitHub's validated live responses are the Code section's factual source, not the illustrative prototype data.
- Prototype copy and remote CDN assets are illustrative, not production facts or dependencies. Global tokens and base rules belong in `app/globals.css`; component values belong in Tailwind utilities or a colocated `*.module.scss` file when custom CSS is necessary. Tests including `tests/e2e/interactions.spec.ts` govern observable behavior.
- Token-value changes alone do not require a documentation update. Refresh this document only when the qualitative direction, token ownership, behavior, or constraints change.

## Brand

- A minimal editorial portfolio: direct, technically credible, calm, and personal without becoming promotional.
- Let typography, open whitespace, thin dividers, and carefully ordered evidence carry the identity.
- Use jade green as a restrained signal, with a subtle green-to-jade sweep on the hero descriptor.
- Avoid dashboard, bento, card-grid, SaaS-shell, marketing-gradient, glass, and component-showcase aesthetics.

- Identity mark: use the softened N/R symbol as a standalone Home control and decorative splash mark. Keep its angular upper-right return and shared vector geometry; use a padded high-contrast version for browser and touch icons. No separate decorative wordmark is established. When the surname is written, use title case: Reshetnik.

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
- `/privacy`, `/terms`, `/accessibility`, and `/for-robots`: global footer site information, with `/llms.txt` as the companion machine-readable guide.
- Unknown project and article slugs resolve to static, noindex 404s.
- Desktop navigation exposes primary destinations inline. Compact layouts use a modal section/navigation sheet. Collection pages keep those destinations pointed at Home section anchors; project and article details center a Back to list link in the header and retain a Home control, while the content title leads the page body.
- Order content from identity and relevance to proof and contact. Metadata stays secondary and in flow; it does not become dashboard chrome.
- About pairs the biography with two quiet career-chapter summaries. Experience begins directly with the timeline, does not repeat those summaries, and ends with a restrained, attributed recommendation strip that scrolls horizontally without carousel controls.

## Design principles

- Editorial before interface: lead with readable content, not containers or controls.
- Evidence before claims: show verified roles, outcomes, work, dates, and links; omit what is unavailable.
- One hierarchy: headings, mono metadata, spacing, and full-measure rules establish structure without boxed section wrappers.
- Progressive by default: semantic HTML and server-rendered content remain useful before hydration; optional behavior must fail open.
- Restraint over novelty: one accent hue, few radii, minimal elevation, and short purposeful motion.

## Visual language

- Color: use a quiet neutral foundation with three text levels: foreground for anchors, content-foreground for sustained reading, and muted-foreground for supporting context. Dark mode preserves the same hierarchy rather than becoming a separate visual theme. Exact colors come from code tokens.
- Accent use: hero descriptor and availability, latest timeline marker, contribution calendar, native field focus, article quote rules, and selection use Jade. Merged PR icons and addition counts use an independent solid success green. The complete hero heading stays neutral; the descriptor alone has a dark-only glow.
- Typography: use a confident sans-serif for display, headings, and prose, with a monospaced secondary voice for dates, counts, code, and numbered labels. The hero should feel expressive, section headings clear, body copy comfortable, and metadata deliberately quiet. Exact families, sizes, weights, tracking, and line heights come from code tokens.
- Measure and rhythm: favor generous outer whitespace, narrow readable prose, clear pauses between sections, and tighter spacing inside related content groups. Long-form pages should feel focused rather than stretched. Exact widths, gutters, and spacing come from code tokens.
- Shape and depth: keep page surfaces flat, use dividers for structure, and reserve radius or shadow for controls and overlays that need affordance or separation. Shadows use neutral-black alpha in both themes and never derive elevation from foreground or other light colors. Sections are not cards.
- Iconography: use Lucide interface icons with consistent outline weight and a subtle theme-aware semantic gradient. Technology and brand marks use a theme-aware solid brand color, a restrained two-color gradient when it suits the mark, or theSVG color variant only when the simpler treatments harm recognition. No emoji or unrelated substitute marks. Exact icon sizing comes from code tokens.
- Motion: keep transitions brief, subtle, and purposeful. Movement should clarify readiness, disclosure, navigation, or state change without becoming a visual event. Each normal route may enter marked intro targets after the opening splash, then reveal each marked row once that row enters the viewport. Explicit nested items may stagger within a row; contribution-calendar squares, controls, and icons remain static except the Experience navigation marker, which flies once from the rail bottom to its top as the rail reveals. Interactive rows may promote their L2 and L3 text to foreground while keeping L1 and semantic colors stable. Desktop wheel and trackpad scrolling may use barely perceptible interpolation that settles promptly; touch remains native. Nothing parallaxes or replays on scroll; exact timing and easing come from code tokens.

### Text-color roles

Use foreground, content-foreground, and muted-foreground in both themes. Color follows the content's purpose, not its HTML element.

| Content role | Resting treatment | Hover and keyboard focus |
| --- | --- | --- |
| L1 anchor: page and section headings, names, job titles, and primary controls | Foreground | Stable |
| L2 reading: prose, descriptions, summaries, quotes, and other content intended to be read | Content foreground | Promote to foreground only when it belongs to a real interactive row or link |
| L3 support: dates, tags, labels, helpers, secondary navigation, and standalone secondary actions | Muted foreground | Promote to foreground only when the supporting text itself is interactive |
| Embedded prose link | Content foreground, medium weight, permanent underline | Foreground with visible keyboard focus |

Static text never changes color merely because a nearby container is hovered. Interactive rows promote their reading content and action cues; stable metadata, L1 identity, and semantic status colors do not change. Experience summaries and highlights are L2, while organization, period, and disclosure labels are L3. Pull-request titles are L2 and promote with the row; repository names and periods remain L3. Writing descriptions promote, while their date and reading-time metadata remain L3. Project pagination keeps its L1 destination stable and promotes its L3 label and arrow. Preserve semantic status, syntax, brand, and primary-control colors as separate roles; do not use opacity to weaken neutral text contrast.

Experience disclosure rows use a pointer cursor across the whole block: the summary, disclosure label, and timeline circle respond to hover and keyboard focus, while company names and dates stay muted. University names use L2. Each certification is one full-block link with its icon, title, and date centered horizontally. Its borderless icon uses L2 and promotes to foreground on hover or keyboard focus, without a background treatment; its title stays L1 and its date stays L3.

## Components

- Reuse the application shell under `app/_shell`, Home sections and interactions under `app/(home)/_components`, native disclosure, route lists, and MDX typography before adding markup.
- Use exact shadcn CLI-owned `base-luma` components under `components/ui/**` for generic controls and overlays. Keep generated source unchanged and accept its default geometry and presentation.
- Configure identity through semantic tokens from `app/globals.css` and documented component props such as `variant`, `size`, and `side` before adding consumer layout classes.
- `app/globals.css` owns the live theme: `--brand-accent` and its start/end tokens define Jade; `--success` independently colors merged PR icons and additions. Generated shadcn controls own focus borders, ring width, opacity, radius, and validation styling; configure only `--ring` for focus color, with no decorative wrappers or CSS focus overrides. Field backgrounds stay neutral through `--input`, and primary buttons retain `--primary`. Selection uses the solid midpoint.
- Glowing text uses the shared `brand-glow` wrapper with a decorative, `aria-hidden` `brand-glow-layer` beneath a sharp `text-brand-gradient` child. Reuse this treatment for future glowing text. Active glow always mixes each text gradient stop at 80% brand color and 20% foreground in OKLab; the glow itself retains its original white core and jade shadows (1px/20%, 6px/55%, 18px/25%, at 0.65 opacity). Light theme and forced colors disable the glow and foreground mix; ordinary gradient text stays unmixed. The descriptor currently uses this treatment.
- CLI metadata (`components.json`) was removed by request. Existing components run without it; restore the generation configuration before using the shadcn CLI to add or regenerate components.
- Gradient scale follows the surface: experience stays grey except for the latest role's filled marker and a short gradient lead-in that fades into the neutral rail. Historical markers remain hollow grey circles. The contribution calendar shares one gradient across all columns while retaining per-day intensity. The latest marker uses the edge gradient; hovering that role preserves its gradient.
- Preserve native `details`/`summary` for experience disclosure, the compact-navigation `<noscript>` fallback, and native form semantics and validation through generated form controls.
- Keep `app/globals.css` limited to Tailwind imports, application-wide tokens, base element rules, and named utilities with at least two real consumers. Component-specific selectors, keyframes, states, and responsive rules must live in a scoped SCSS module beside their owning component.
- Do not use Tailwind arbitrary-value or arbitrary-variant syntax in component markup. Use the closest standard utility when it stays within 5% of the approved design, a colocated SCSS module for a one-off customization, or a named reusable utility when the same customization has multiple consumers.
- Keep route-specific section, index, article, and case-study rendering within its route slice. Home uses the URL-neutral `(home)` route group; its private components live in named folders with colocated SCSS. Keep one-place route markup inside its owner instead of extracting fragment components; promote a shared component only after two independent consumers or for an intrinsically application-wide concern.
- Required states belong to the owning component: default, hover, focus-visible, active/open, invalid, disabled, loading/readiness, success, and unavailable where relevant.

## Accessibility

- Assumption — target standard: WCAG 2.2 AA. Confirm formal conformance scope and audit ownership before claiming compliance.
- Use semantic landmarks, ordered headings, real links/buttons, labeled form controls, meaningful alternative text, and decorative icons hidden from assistive technology.
- Preserve visible focus, full keyboard operation, and adequate target sizes. Modal navigation traps focus, closes with Escape, and returns focus to its trigger.
- Maintain AA contrast for text, controls, dividers that convey meaning, focus indicators, and light/dark themes; do not rely on color or motion alone to communicate state.
- Keep readable line lengths and allow text reflow/zoom without clipped content or horizontal page scrolling; code blocks may scroll locally.
- Under reduced motion, remove translation, stagger, pulsing, and smooth-scroll interpolation; cross-fade the descriptor in place, show a static splash, and make programmatic anchor travel immediate. Home entrances may use a brief opacity-only transition. Maintain usable no-JavaScript fallbacks.

## Responsive behavior

- Desktop: use generous side whitespace, inline primary navigation, expressive hero typography, multi-column editorial compositions, and a distinct experience date rail.
- Tablet: reduce unused side space, open compact navigation as a content-height blurred extension below the header, compress supporting rails, and retain split layouts only while they remain comfortably readable.
- Mobile: use a compact header whose section selector opens the same content-height blurred extension below it, comfortable page edges, a focused hero, single-column reading flow, and stacked metadata and actions. When four social links cannot stay on one line, lay them out as two balanced rows of two rather than leaving an orphan link.
- About uses equal biography and career-chapter columns separated by a divider on desktop, then stacks biography, chapters, and facts in that order on mobile.
- Adapt hierarchy rather than scaling the desktop canvas: preserve reading order, move side metadata into flow, stack split layouts, and keep controls reachable without hover.
- Exact breakpoints, dimensions, and responsive type or spacing values come from code tokens and must not be duplicated here.

## Interaction states

- Splash: a quiet softened N/R symbol with a secondary role label with no progress bar and a deliberate reading pause before exit. A first-load pre-paint marker makes it fully opaque before page content can paint; only its departure animates. Publish completion while the splash still covers the page so route motion is armed before removal. Refreshes and internal navigation never replay it. Keep it decorative, pointer-transparent, non-focusable, light/dark aware, terminal on success or failure, static for reduced motion, absent as a blocker under no-JavaScript, and indefinitely visible only under the explicit debug query.
- Page entrance: begin each route's semantic intro targets from the covered splash handoff. Keep later section roots stable, then reveal their meaningful rows once the trigger crosses the 90% viewport-height line. Rows entering together cascade in document order, while nested row items keep the same quiet stagger. Fail open terminally for keyboard focus and hydration/setup errors, and keep server-rendered content visible when JavaScript is unavailable.
- Scrolling: soften vertical wheel and trackpad input without a visible coast, preserve native touch, and stop residual inertia across route navigation. Same-page anchors may travel smoothly while retaining their CSS scroll margins. Nested menus and horizontal tracks keep native scrolling, and no content or reveal behavior depends on the enhancement.
- Navigation: transparent/quiet at rest, separated by a border when scrolled; highlight the desktop and compact link whose section top has reached the sticky-header edge. Keep the closed compact selector unchanged while its content-height phone and tablet sheet shares one continuous background, typography, color, width, and flat styling with the open header. Omit a redundant visible menu title, and replace the header theme control with the dialog close control while open. Preserve the blurred backdrop, selected-section state, Escape, focus containment, and focus return without a floating-modal treatment.
- Disclosure: collapsed and expanded in document flow with native keyboard semantics; avoid overlaying or hiding its content.
- Contact: empty, focused, invalid, ready, and native mail-app handoff states. Keep the direct `mailto:` address as fallback; do not imply server delivery.
- Optional activity: derive PR counts, PR rows, summaries, dates, and the contribution graph from validated live GitHub responses with bounded revalidation. On empty, error, slow, or offline states, keep the profile link and render no stale fixture, broken row, or empty graph.
- Content collections: omit unavailable optional fields; provide a quiet empty explanation only when an entire index has no entries.
- Errors: invalid known content fails validation/build; unknown routes use the relevant static 404 with a route back to valid content.
- Success and disabled: acknowledge completed local actions without celebratory decoration; disabled controls remain visibly unavailable and are not the sole route to core content.

## Content voice

- Write in first person for the introduction, profile, and career chapters, as Nikita talking to a professional colleague. Keep the wording factual and relaxed, with enough warmth to sound like a person.
- Let the work establish competence. Describe what Nikita builds, takes responsibility for, and helps others do; avoid self-ratings such as “strong foundation,” “expert,” or “exceptional.”
- Prefer everyday verbs and natural phrasing: “I build,” “I work on,” “teaming up,” and “outside my day job.” Replace bureaucratic wording such as “my responsibilities encompass” with a direct description of the work.
- Summaries condense experience and responsibility. Use present tense to describe expertise; reserve detailed chronology and past accomplishments for experience entries. Keep breadth visible without listing every tool or LLM workflow.
- Add warmth through rhythm, contractions, and ordinary language. Avoid forced jokes, invented personality traits, motivational slogans, metaphors, and clever contrasts such as “a foundation, not a boundary.”
- Keep short headings plain and specific. Do not claim scale, impact, or other outcomes that the source material does not establish.
- Voice example: “I build features across .NET services, plugins, and desktop applications. That also means working through slow SQL queries, reviewing code, and teaming up with QA and DevOps to get releases out and sort out deployment issues.” Preserve this balance of substance and ease when revising copy.
- Use sentence case, short labels, active verbs, and unrounded factual values. Avoid hype, fake urgency, generic endorsements, emoji, and invented metrics.
- Production biography, credentials, canonical origin, projects, articles, dates, and links come from validated repository sources. Code activity comes from validated live GitHub responses. Omit unavailable facts rather than displaying placeholders, cached fixtures, or illustrative canvas copy.

## Implementation constraints

- Preserve the route-oriented vertical-slice modular monolith: routes own routing, metadata, Server Components composition, static parameters, not-found decisions, route rendering, and route tests.
- Server Components remain the default. The exact client entries are `app/_shell/theme/theme.tsx`, `app/_shell/mobile-navigation/mobile-navigation.tsx`, `app/_shell/opening-splash/opening-splash.tsx`, `app/_shell/page-motion/page-motion.tsx`, `app/_shell/smooth-scroll/smooth-scroll.tsx`, `app/_shell/local-time/local-time.tsx`, `app/(home)/_components/descriptor-rotation/descriptor-rotation.tsx`, `app/(home)/_components/contact-form/contact-form.tsx`, `app/(home)/_components/home-editorial-row/home-editorial-row.tsx`, and `app/(home)/_components/home-experience/experience-item.tsx`.
- `app/layout.tsx` is the sole application layout. `app/(home)/page.tsx` owns `/`, and the `(home)` group has no layout or URL segment.
- Keep structured portfolio data as typed TypeScript records and local repository-authored MDX as trusted executable content. Validate imported metadata, normalized slugs, and case-insensitive duplicates.
- Project and article detail routes use static parameters with dynamic params disabled; optional activity cannot delay or remove curated content.
- Home project and writing rows share one layout and follow their Read link from ordinary row clicks. Text stays selectable; other links remain independent. Hovering another link suppresses the Read hover highlight. Home writing metadata shows the publication date without reading time.
- Prefer native HTML and CSS to JavaScript. Server-rendered content remains meaningful before hydration; client decoration must fail open.
- Contact remains a native-validating `mailto:` flow unless a backend is explicitly approved.
- Use local production assets. Remote prototype fonts, icons, images, and CDN URLs are illustrative delivery evidence only.
- Reuse the generated shadcn component surface and existing token ownership. All exact design values remain in code; do not synchronize them into this document or add another registry, global state, wrapper layer, or design-system abstraction.
- Use an existing Tailwind utility whenever it reproduces the reference within a 5% visual tolerance. Keep one-off custom values in the owning component's `*.module.scss`; promote a value to a named global utility only when a second real consumer exists.

## Open questions

- [ ] Validate the assumed hiring-reviewer, engineering-peer, and prospective-contact personas with actual audience research; impact: prioritization and language, not current architecture.
- [ ] Define measurable success signals and whether privacy-preserving analytics are wanted; impact: evaluation only, not permission to add tracking.
- [ ] Confirm the WCAG 2.2 AA audit scope, supported browser matrix, and named owner before making a formal conformance claim.
- [ ] Confirm which illustrative canvas copy and assets, if any, have been validated into `content/`; until then, production must omit them.
