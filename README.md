<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/grafanaKibana/web-portfolio-v2/HEAD/public/projects/web-portfolio-v2/hero-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/grafanaKibana/web-portfolio-v2/HEAD/public/projects/web-portfolio-v2/hero.png">
  <img src="https://raw.githubusercontent.com/grafanaKibana/web-portfolio-v2/HEAD/public/projects/web-portfolio-v2/hero.png" alt="Product overview">
</picture>

<p align="center">
Next.js portfolio with validated structured content and repository-authored MDX.
</p>

<p align="center">
<a href="https://reshetnik.dev"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/View_portfolio.svg?variant=default&amp;size=sm&amp;font=geist&amp;mode=dark&amp;logo=ri%3ALuArrowUpRight&amp;color=84cc16&amp;logoColor=0e100f&amp;valueColor=0e100f&amp;labelTextColor=0e100f&amp;gradient=84cc16%2C95d133%2C110"><img alt="View portfolio" src="https://shieldcn.dev/badge/View_portfolio.svg?variant=default&amp;size=sm&amp;font=geist&amp;mode=light&amp;logo=ri%3ALuArrowUpRight&amp;color=437100&amp;logoColor=ffffff&amp;valueColor=ffffff&amp;labelTextColor=ffffff&amp;gradient=437100%2C4c7a10%2C110" style="display:inline-block;margin:0;vertical-align:middle"></picture></a>
<a href="https://github.com/grafanaKibana/web-portfolio-v2/actions/workflows/verify.yml"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/github/ci/grafanaKibana/web-portfolio-v2.svg?variant=outline&amp;size=sm&amp;font=geist&amp;mode=dark&amp;label=CI&amp;workflow=verify.yml&amp;branch=main&amp;statusDot=true&amp;gradient=18181b%2C18181b%2C90&amp;labelTextColor=fafafa"><img alt="CI status" src="https://shieldcn.dev/github/ci/grafanaKibana/web-portfolio-v2.svg?variant=outline&amp;size=sm&amp;font=geist&amp;mode=light&amp;label=CI&amp;workflow=verify.yml&amp;branch=main&amp;statusDot=true&amp;gradient=fafafa%2Cfafafa%2C90&amp;labelTextColor=18181b" style="display:inline-block;margin:0;vertical-align:middle"></picture></a>
</p>

A personal portfolio presenting Nikita Reshetnik’s experience, projects, writing, and contact information. The homepage provides an overview, with dedicated pages for project case studies and technical articles.

## Get started

Browse Home for the profile and selected work, Projects for the full project index and case studies, or Articles for technical writing.

Ask answers questions about Nikita’s published work, role fit, and evidence for skills, with citations linking to site content. Paste the job description when asking about a role: the service does not fetch submitted job URLs or browse the web.

## Local setup

Use Node.js 22, matching CI, and npm.

```bash
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). The `predev` script generates hero backgrounds. To serve a production build, run `npm run build`, then `npm start`.

Live Ask requires server-only `ASK_API_KEY` in `.env.local` or the platform environment. The Ask API guide below documents endpoint, model, and completion-limit defaults and overrides. Page browsing does not require that key. Optional server-only `GITHUB_TOKEN` enables pull-request activity rows; public contribution data can render without it. Keep both credentials out of `NEXT_PUBLIC_` variables.

## How it works

Next.js Server Components load validated local content. [portfolio.yaml](content/portfolio.yaml) supplies profile and Home records. Project and article loaders validate MDX slugs and metadata, then supply a fixed set of static detail routes. Unknown slugs return a 404. Client components add theme, navigation, and conversation behavior.

Ask loads the validated public portfolio corpus, adds bounded optional activity data, and makes a structured model request. It streams answer text followed by validated local citations and follow-ups, and stores no transcript on the server. Optional metrics failures retain curated content rather than removing project pages.

## Update content

Update structured facts in the YAML and long-form pages in [content/projects](content/projects/) or [content/articles](content/articles/). MDX is trusted executable repository source.

`package.json` provides focused content, Ask, conversation, lint, typecheck, and browser-test commands.

## Guides

- [Design guide](DESIGN.md) — Visual direction, content voice, and interaction behavior.
- [Ask API guide](app/api/ask/README.md) — Local credentials, portfolio grounding, streaming, and error behavior.

[Report an issue](https://github.com/grafanaKibana/web-portfolio-v2/issues) | [Contributing](https://github.com/grafanaKibana/web-portfolio-v2/pulls) | License: not specified.
