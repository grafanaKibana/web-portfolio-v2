# Design

## Source of truth

**Status:** Current design direction. **Updated:** 2026-09-14.

This document explains how portfolio should look, read, and behave. It records established design decisions, checked against the current site. Code owns exact tokens, dimensions, breakpoints, and animation timings; [AGENTS.md](AGENTS.md) owns engineering rules; [content](content/) owns portfolio facts.

Evidence: [Home composition](app/(home)/page.tsx), [fonts and site frame](app/layout.tsx), [theme and shared styles](app/globals.css), [navigation](components/site-header/site-header.tsx), [About](app/(home)/_components/about/about.tsx), [Skills](app/(home)/_components/skills/skills.tsx), and the [conversation contract](app/api/ask/README.md). Repository evidence includes work in progress; implementation alone does not establish an approved design change. This refresh makes no new visual-audit claim. Unselected explorations remain outside this direction.

## Brand

The portfolio feels personal, calm, precise, and technically credible. Typography, whitespace, and specific work carry the identity. Jade adds recognition without dominating the page.

Use the shared [N/R mark](public/brand/mark.svg) for the Home identity and decorative opening treatment. Keep the name “Nikita Reshetnik” consistent. Build trust through readable experience, project evidence, writing, and direct links.

Avoid promotional slogans, decorative dashboards, bento layouts, glass effects, and boxing every section into a card. The Home hero is the background-gradient exception: a theme-aware Still field follows Matcha Cream: warm ivory, soft sage, and forest greens shifted gently toward the jade accent, with emerald, jade, and teal tones drawn from the dark-theme accents in dark mode. The static hero field is generated from its palette and Still settings before development and production builds, then preloaded as small cached images from the server HTML so it does not wait for hydration or canvas rendering. Its lightly grained field fades early and gradually into the page, extending slightly into About, and continues behind the transparent header. The header uses the hero foreground from the first styled frame and restores its ordinary surface after the hero has passed. Derive solid foreground colors from the palette, adding a neutral veil only when needed for readable contrast. Keep broad gradients out of other page backgrounds; existing accent and icon treatments have specific roles below.

## Product goals

Help visitors understand the work, inspect the evidence that interests them, and find a straightforward way to make contact. Support both a quick overview and deeper reading without forcing an interaction.

Curated content remains useful when optional data or enhancements are unavailable. Conversation is a supplementary entry point for questions that require connecting portfolio evidence, such as role fit or where Nikita applied a skill.

A useful qualitative check is whether a visitor can identify relevant experience, reach supporting work, and find contact details. This is a design criterion, not a measured conversion result.

## Personas and jobs

Working audiences are hiring reviewers assessing fit, engineering peers exploring technical work, and prospective collaborators seeking contact. Their shared needs are clear context, credible evidence, and easy navigation. Relative audience priority remains an assumption.

Support desktop review, mobile scanning, and focused long-form reading. Keyboard use and reduced-motion preferences are ordinary browsing contexts.

## Information architecture

Home progresses through **Hero → About → Experience → Education → Skills → Selected work → Code activity → Writing → Contact**.

The hero introduces Nikita and offers direct contact, résumé, and experience actions. Its server-rendered text, descriptor, and actions retain their staggered fade-and-rise reveal. The reveal starts from the first styled frame without waiting for background assets or hydration; on the first visit, it follows the opening splash handoff. The header and AI entry line join the opening reveal without waiting for hydration. Reduced motion uses a short fade without translation. About provides the personal overview and career chapters; Experience carries the detailed timeline and recommendations. Projects and writing provide deeper evidence before Contact.

| Surface | Role |
| --- | --- |
| `/` | Editorial overview with direct section navigation |
| `/projects` and `/projects/[slug]` | Project index and individual case studies |
| `/articles` and `/articles/[slug]` | Writing index and focused reading |
| `/privacy`, `/terms`, `/accessibility`, `/for-robots` | Supporting site information linked from the footer |
| `/llms.txt` | Machine-readable companion information |

Keep desktop section navigation inline. Compact navigation extends below the header. Collection pages link sections back to Home; detail pages offer Home and Back to list, leaving the content title in the reading area.

## Design principles

- **Lead with content.** Establish hierarchy with type, spacing, and rules before adding containers.
- **Make depth optional.** Let visitors scan summaries, follow evidence, or open details at their own pace.
- **Keep meaning stable.** Text hierarchy, status colors, and action labels remain understandable across themes and states.
- **Use familiar interactions.** Links navigate, buttons act, disclosures expand in flow, and forms explain what happens next.
- **Keep enhancements dependable.** Motion and optional features must leave core reading and navigation available when they fail.

When expression competes with legibility or reliable interaction, preserve reading and navigation.

## Visual language

### Color

Use neutral light and dark foundations with three text roles: foreground for titles and controls, content foreground for prose, and muted foreground for dates and supporting labels. Keep neutral text readable through semantic colors rather than opacity.

Jade marks selected identity and state moments: the hero descriptor, availability, current experience, contribution activity, focus, and conversation entry. Preserve distinct success and destructive semantics. Fields stay neutral through `--input`; focus uses `--ring`. Standard primary buttons retain their semantic treatment.

Inline prose links stay underlined. Hover and focus may strengthen the text of an actual link or interactive row; static content must not react to an unrelated hovered container.

### Typography, layout, and shape

Use Geist Sans for headings and reading, and Geist Mono for dates, labels, counts, and code. Keep overview prose compact and long-form reading more spacious, with metadata and footer links sharing a quiet secondary scale. Let the hero scale down naturally on tablet and phone. Distinguish top-level section markers from subsections through weight while retaining their shared uppercase Mono treatment and divider lines, including the centered Skills rules.

Give the page generous gutters and consistent pauses between sections, with smaller gaps inside related groups. Keep metadata secondary and align long-form reading directly to the shared editorial shell. Headings separate reading sections more strongly than paragraphs; the first content block sits close to its header divider. Thin dividers and open rows provide structure. Reserve rounded surfaces and shadows for controls and overlays that need separation.

### Icons and imagery

Use Lucide for interface actions and recognizable technology marks for skills and external identities. Preserve the existing solid, gradient, and multicolor skill treatments where they convey identity or category. Avoid replacing all marks with one universal brand color. Keep assets local and decorative icons hidden from assistive technology.

### Motion

Use motion for entry, disclosure, navigation, and meaningful state changes. The decorative opening hands off to page introductions; rows reveal once in document order. Skills reveal at group level. Preserve the established one-time Experience navigation-marker movement.

Keep controls and individual icons still unless their existing behavior requires movement. Avoid parallax, repeated scroll reveals, and prolonged coasting. Wheel interpolation settles promptly; touch scrolling stays native. Reduced motion removes spatial movement, stagger, pulsing, and interpolation in favor of static or brief opacity treatments.

## Components

| Pattern | Direction |
| --- | --- |
| Header | Quiet, sticky navigation with selected-section feedback; compact navigation feels continuous with it |
| Editorial sections | Open rows and dividers; selectable text and independently usable links |
| Experience | In-flow native disclosures; accent on the current role, neutral historical markers |
| Education | Academic keeps its natural height; credentials show two full entries and a partial next entry when more exist, with the Recommendations edge fade and full-row verification links |
| Skills | Centered semantic groups, recognizable marks, and restrained group reveals |
| Project and article pages | Strong title, secondary metadata, focused prose, clear return navigation |
| Contact | Direct email and profile links in source order, aligned beside the introduction on wide screens |
| Conversation | Direct page composer, nonmodal desktop panel and full-screen modal phone thread, validated inline sources and clear recovery |

The conversation entry is an intentional accent exception: desktop rests as a jade line and reveals the standard composer on hover, click or keyboard intent. The first question is entered on the page, with a left star, the shared “Ask about my work…” placeholder, an opaque field, a standard shadcn Send button on desktop and arrow on phone, and a subtle form-local page-colored radial fade without blur. Phone entry unfolds on tap; either layout also reveals it at the end of the page, where footer space keeps the field clear of content. Only an accepted send opens the thread. Retained history reveals a field-shaped reopen control on desktop hover, phone tap, or at the page end, and reopens on click or keyboard activation. Mobile and touch reopening keeps the keyboard closed; desktop mouse, pen and keyboard intent retains composer focus after reveal without overriding a later focus choice.

Reuse existing route and site-frame patterns and shared [UI components](components/ui/). These components are editable repository source: keep them reusable, document authored declarations, and review affected consumers when changing shared behavior. Configure controls through public props and semantic tokens. Keep feature geometry in its owning styles and avoid introducing a separate design-system layer.

## Accessibility

WCAG 2.2 AA remains the working design target; this document does not certify conformance.

Preserve semantic landmarks and heading order, the skip link, accessible names, visible focus, keyboard actions, and text selection. Color and motion must not be the only indicators of state. Hover cannot be the only way to reach information.

Compact navigation is modal: contain focus, close with Escape, and restore focus to its trigger. Conversation remains nonmodal at desktop widths. Below the phone breakpoint it uses a native full-screen modal dialog with contained focus, reversible document scroll locking and noneditable focus return. Keep native disclosure behavior, no-JavaScript fallbacks, and a decorative, non-focusable splash that cannot block content.

Support readable contrast in both themes, text zoom, and reflow without page-level horizontal scrolling. Code and intentional horizontal tracks may scroll locally. Keep targets usable by touch and honor reduced motion.

Phone conversation prioritizes reading: user bubbles precede full-width assistant prose, icon-only Copy and Retry share a compact left-aligned footer beneath replies with shared copy feedback, and only the latest completed follow-ups appear as full-width pills in the top part of the composer, expanding it upward while preserving the text field below. The transcript scrolls only when its content exceeds the available viewport. Light conversation surfaces follow the page background and foreground tokens. Dark panels use the card surface, with muted bubbles one step above the panel. Shared field primitives own the composer surface, border, radius, typography, and single-line height. The composer shares typography and inset spacing across hosts; controls stay at the bottom of multiline input. Composer type is 16px below 768px and 14px from 768px. Single-line fields are 40px on desktop and 44px on phone, with standard 32px and 36px buttons respectively, a 3px inner inset, and content-driven multiline growth. The phone field uses a horizontal input and arrow row with comfortable touch targets; Stop expands to fit its label with a brief width transition. Copy success returns to the Copy icon after two seconds. The idle jade line resizes into the page composer on desktop hover or phone tap. An isolated field surface changes width and height while its unscaled controls fade independently; the field is never revealed through a mask. Rounding and neutral color arrive early as the field expands, and jade returns late as it closes. On desktop, the revealed field rests slightly above the line, then moves up to its thread position as sending reveals the panel independently; the line stays hidden while the thread is open. Close fades the panel and moves only the composer into the jade line, without scaling its text. New chat closes and clears the thread with an uninterrupted handoff to the visible, focused page composer on both layouts. Completed mobile suggestions fade as the field surface shrinks to the empty single-row destination, which exactly matches the replacement field. Phone thread motion is slower than desktop, with the field finishing after the thread. On desktop, a stationary pointer does not reopen the field after dismissal; fresh pointer movement resumes hover reveal. Reduced motion reaches the same final states immediately. Sending anchors the question rather than following streamed text. The reading header has New chat at the top left and Close at the right, with no visible title. Composer focus smoothly contracts the phone header to a slim close handle that supports tap, keyboard and downward drag while retaining a 44px hit target; accepted sends restore the reading header. Responsive host changes retain the same request, draft and history.

## Responsive behavior

Desktop has generous outer space, inline navigation, split editorial compositions, and a distinct experience date rail. Narrow layouts move toward a single reading column with metadata and actions in normal flow. About stacks its biography and chapters as space tightens.

Education pairs Academic and Professional credentials at comfortable desktop widths and stacks them at narrower widths. On desktop, Credentials takes only its needed width up to a comfortable cap, and Academic fills the remainder. Credential marks may be monochrome icons or intact issuer badges. Show two full credentials and part of the next when the list overflows; short collections use one item per row. Academic has no trailing padding. Native scrolling and focus must reach every credential.

Contact places its introduction and direct links in one wide-screen row, with the links using only their intrinsic width on the right. Links use two compact columns in source order, with E-Mail as the visible email label and the address retained in its accessible name. Narrow or enlarged layouts stack the two groups and may reduce the link grid to one column. Let other social links and skill groups wrap naturally. Keep reading order intact and use split layouts only while both groups remain comfortable. Compact navigation and conversation fit the available viewport, including the on-screen keyboard. Touch actions remain available without hover.

Breakpoints belong in code. Evaluate both representative screen sizes and the widths where a layout changes.

## Interaction states

| Situation | Visitor-facing behavior |
| --- | --- |
| Opening and reveals | Decorative, once-only enhancement; content remains available when setup fails or JavaScript is absent |
| Loading or streaming | Clear progress without treating partial output as complete; stable reading space |
| Empty or missing data | Quiet empty-index explanation; omit absent optional fields and retain useful source/profile links |
| Unknown content | A clear not-found page with a route back |
| Error or interruption | Readable explanation and an appropriate retry, edit, or fallback action |
| Success | Brief confirmation tied to the action; no decorative celebration or misleading delivery claim |
| Unavailable action | Recognizable control with accessible state and an available alternative where applicable |

Contact opens the visitor’s email app; it does not confirm delivery. Optional activity must never substitute fabricated events for unavailable data.

Conversation distinguishes pending, completed, stopped, and failed replies, and announces completion or failure without reading every chunk. Generated follow-ups prefill their full, self-contained question into the composer, replacing the current draft and focusing it for editing before explicit submission. On desktop, exchange pairs have no additional inter-pair gap or trailing padding. The desktop panel grows with its content up to two-thirds of the visible viewport height, then scrolls its message history. Panel resizing, bubble growth, and scrolling share a 280ms transition and easing curve; bubble entry follows the same rhythm. Reduced motion keeps geometry immediate. Thinking uses the default Marker treatment. Desktop reply actions stay compact and attached to their exchange; desktop follow-ups share one connected pill, wrap naturally, and scale into view together with the same brief motion as reply actions. Application-owned numbered citations use the text accent color and link to validated sources inline with the answer. Preserve accessible error details and clipboard feedback.

Answer text reveals across each rendered line with a soft left-to-right sweep lasting about 480ms. New chunks continue from the current reveal edge; earlier lines remain visible. Follow-ups enter after the 280ms growth phase, finishing alongside the text reveal. Completion does not cut the sweep short or delay response actions. Reduced motion keeps arriving text static. Drafts and transcript stay in memory across dismissal and client navigation. Active generation stops when dismissed or on route changes. Contact remains the fallback when conversation cannot open. Detailed provider, cancellation, and history rules stay in the [conversation contract](app/api/ask/README.md).

## Content voice

Write in first person, factual, conversational, and lightly warm—as Nikita speaking to a professional colleague.

Use concrete verbs and specific work. Let experience and outcomes establish competence without self-ratings, invented metrics, or unsupported scale. Use current tense for present expertise and chronology for experience entries.

Prefer short, specific headings, ordinary language, natural contractions, and sentence case. Keep summaries selective instead of listing every tool. Avoid hype, bureaucratic phrasing, slogans, forced jokes, emoji, and clever contrasts.

Use validated records and local MDX for biography, credentials, dates, projects, and links. Live answers stay honest and supportive: distinguish direct evidence from transferable ability and keep the assistant scoped to Nikita rather than generic technical discussion. Opening an email app remains a handoff. Preserve original link labels when optional metadata is unavailable.

## Implementation constraints

Work within the existing Next.js, React, Tailwind, and colocated SCSS structure. Keep server-rendered content meaningful before hydration; prefer native HTML and CSS for interaction where practical. Follow [AGENTS.md](AGENTS.md) for ownership, editable shared-UI boundaries, imported-source handling, source documentation, and verification.

Verify design behavior with synthetic or controlled fixtures. Production portfolio records own published facts; they are not test fixtures or expected values. Optional collections may be empty without invalidating functional verification.

Change this document when design direction changes. Keep exact visual values and runtime details in their existing source files. A token adjustment alone does not require duplicate prose edits.

For visual changes, verify rendered light/dark and mobile/desktop states, including affected keyboard, reduced-motion, fallback, and error behavior. Report what was actually checked; source inspection alone is not visual verification.

## Open questions

- Audience priorities and success measures have not been validated; they should inform future emphasis rather than be presented as established research.
- The supported browser matrix and scope of a formal accessibility audit remain to be defined.
- Live conversation usefulness and role-fit judgment require human evaluation beyond structural and browser verification.
