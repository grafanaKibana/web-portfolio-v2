# Design

## Source of truth

**Status:** Current design direction. **Updated:** 2026-09-14.

This document explains how portfolio should look, read, and behave. It records established design decisions, checked against the current site. Code owns exact tokens, dimensions, breakpoints, and animation timings; [AGENTS.md](AGENTS.md) owns engineering rules; [content](content/) owns portfolio facts.

Evidence: [Home composition](app/(home)/page.tsx), [fonts and site frame](app/layout.tsx), [theme and shared styles](app/globals.css), [navigation](components/site-header/site-header.tsx), [About](app/(home)/_components/about/about.tsx), and [Skills](app/(home)/_components/skills/skills.tsx). Repository evidence includes work in progress; implementation alone does not establish an approved design change. This refresh makes no new visual-audit claim. Unselected explorations remain outside this direction.

## Brand

The portfolio feels personal, calm, precise, and technically credible. Typography, whitespace, and specific work carry the identity. Jade adds recognition without dominating the page.

Use the shared [N/R mark](public/brand/mark.svg) for the Home identity and decorative opening treatment. Keep the name “Nikita Reshetnik” consistent. Build trust through readable experience, project evidence, writing, and direct links.

Avoid promotional slogans, decorative dashboards, bento layouts, glass effects, and boxing every section into a card. Keep broad marketing gradients out of page backgrounds; existing accent and icon treatments have specific roles below.

## Product goals

Help visitors understand the work, inspect the evidence that interests them, and find a straightforward way to make contact. Support both a quick overview and deeper reading without forcing an interaction.

Curated content remains useful when optional data or enhancements are unavailable.

A useful qualitative check is whether a visitor can identify relevant experience, reach supporting work, and find contact details. This is a design criterion, not a measured conversion result.

## Personas and jobs

Working audiences are hiring reviewers assessing fit, engineering peers exploring technical work, and prospective collaborators seeking contact. Their shared needs are clear context, credible evidence, and easy navigation. Relative audience priority remains an assumption.

Support desktop review, mobile scanning, and focused long-form reading. Keyboard use and reduced-motion preferences are ordinary browsing contexts.

## Information architecture

Home progresses through **Hero → About → Experience → Education → Skills → Selected work → Code activity → Writing → Contact**.

The hero introduces Nikita and offers résumé and experience actions. About provides the personal overview and career chapters; Experience carries the detailed timeline and recommendations. Projects and writing provide deeper evidence before Contact.

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

Jade marks selected identity and state moments: the hero descriptor, availability, current experience, contribution activity, and focus. Preserve distinct success and destructive semantics. Fields stay neutral through `--input`; focus uses `--ring`. Standard primary buttons retain their semantic treatment.

Inline prose links stay underlined. Hover and focus may strengthen the text of an actual link or interactive row; static content must not react to an unrelated hovered container.

### Typography, layout, and shape

Use Geist Sans for headings and reading, and Geist Mono for dates, labels, counts, and code. Balance an expressive hero with quiet section labels, clear headings, and comfortable prose.

Give the page generous gutters and clear pauses between sections. Keep related material close, metadata secondary, and long-form reading narrower than the overall canvas. Thin dividers and open rows provide structure. Reserve rounded surfaces and shadows for controls and overlays that need separation.

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
| Skills | Centered semantic groups, recognizable marks, and restrained group reveals |
| Project and article pages | Strong title, secondary metadata, focused prose, clear return navigation |
| Contact | Native validation, mail-app handoff, and direct email fallback |

Reuse existing route and site-frame patterns and shared [UI components](components/ui/). These components are editable repository source: keep them reusable, document authored declarations, and review affected consumers when changing shared behavior. Configure controls through public props and semantic tokens. Keep feature geometry in its owning styles and avoid introducing a separate design-system layer.

## Accessibility

WCAG 2.2 AA remains the working design target; this document does not certify conformance.

Preserve semantic landmarks and heading order, the skip link, accessible names, visible focus, keyboard actions, and text selection. Color and motion must not be the only indicators of state. Hover cannot be the only way to reach information.

Compact navigation is modal: contain focus, close with Escape, and restore focus to its trigger. Keep native disclosure behavior, no-JavaScript fallbacks, and a decorative, non-focusable splash that cannot block content.

Support readable contrast in both themes, text zoom, and reflow without page-level horizontal scrolling. Code and intentional horizontal tracks may scroll locally. Keep targets usable by touch and honor reduced motion.

## Responsive behavior

Desktop has generous outer space, inline navigation, split editorial compositions, and a distinct experience date rail. Narrow layouts move toward a single reading column with metadata and actions in normal flow. About stacks its biography, chapters, and facts as space tightens.

Let social links and skill groups wrap naturally. Keep reading order intact and use split layouts only while both columns remain comfortable. Compact navigation fits the available viewport, including the on-screen keyboard. Touch actions remain available without hover.

Breakpoints belong in code. Evaluate both representative screen sizes and the widths where a layout changes.

## Interaction states

| Situation | Visitor-facing behavior |
| --- | --- |
| Opening and reveals | Decorative, once-only enhancement; content remains available when setup fails or JavaScript is absent |
| Empty or missing data | Quiet empty-index explanation; omit absent optional fields and retain useful source/profile links |
| Unknown content | A clear not-found page with a route back |
| Error or interruption | Readable explanation and an appropriate retry, edit, or fallback action |
| Success | Brief confirmation tied to the action; no decorative celebration or misleading delivery claim |
| Unavailable action | Recognizable control with accessible state and an available alternative where applicable |

Contact opens the visitor’s email app; it does not confirm delivery. Optional activity must never substitute fabricated events for unavailable data.

## Content voice

Write in first person, factual, conversational, and lightly warm—as Nikita speaking to a professional colleague.

Use concrete verbs and specific work. Let experience and outcomes establish competence without self-ratings, invented metrics, or unsupported scale. Use current tense for present expertise and chronology for experience entries.

Prefer short, specific headings, ordinary language, natural contractions, and sentence case. Keep summaries selective instead of listing every tool. Avoid hype, bureaucratic phrasing, slogans, forced jokes, emoji, and clever contrasts.

Use validated records and local MDX for biography, credentials, dates, projects, and links. Label actions honestly: opening an email app is a handoff. Preserve original link labels when optional metadata is unavailable.

## Implementation constraints

Work within the existing Next.js, React, Tailwind, and colocated SCSS structure. Keep server-rendered content meaningful before hydration; prefer native HTML and CSS for interaction where practical. Follow [AGENTS.md](AGENTS.md) for ownership, editable shared-UI boundaries, imported-source handling, source documentation, and verification.

Verify design behavior with synthetic or controlled fixtures. Production portfolio records own published facts; they are not test fixtures or expected values. Optional collections may be empty without invalidating functional verification.

Change this document when design direction changes. Keep exact visual values and runtime details in their existing source files. A token adjustment alone does not require duplicate prose edits.

For visual changes, verify rendered light/dark and mobile/desktop states, including affected keyboard, reduced-motion, fallback, and error behavior. Report what was actually checked; source inspection alone is not visual verification.

## Open questions

- Audience priorities and success measures have not been validated; they should inform future emphasis rather than be presented as established research.
- The supported browser matrix and scope of a formal accessibility audit remain to be defined.
