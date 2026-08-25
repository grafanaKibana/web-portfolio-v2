import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { loadActivitySnapshot } from "../content/activity"
import { discoverMdxSlugs } from "../content/discovery"
import { validateMdxModule } from "../content/load"
import { validateContentMetadata } from "../content/metadata"
import { validateSlug } from "../content/slugs"
import { home, profile } from "../content/structured"

test("valid article and project metadata is accepted", () => {
  const article = validateContentMetadata(
    {
      kind: "article",
      title: "Building an evaluation harness",
      description: "A repeatable way to evaluate model changes.",
      published: "2026-08-21",
      tags: ["testing", "llm"],
    },
    "article fixture",
  )
  assert.equal(article.kind, "article")
  assert.equal(article.published, "2026-08-21")
  assert.deepEqual(article.tags, ["testing", "llm"])

  const project = validateContentMetadata(
    {
      kind: "project",
      title: "DevBook",
      description: "A source-controlled technical knowledge base.",
      links: [{ label: "Source", href: "https://github.com/grafanaKibana/devbook.zip" }],
    },
    "project fixture",
  )
  assert.equal(project.kind, "project")
  assert.deepEqual(project.links, [
    { label: "Source", href: "https://github.com/grafanaKibana/devbook.zip" },
  ])
})

test("malformed required metadata fails with its source and field", () => {
  assert.throws(
    () => validateContentMetadata(
      { kind: "article", description: "Missing title", published: "2026-08-21" },
      "broken-article.mdx",
    ),
    /broken-article\.mdx.*title/i,
  )
  assert.throws(
    () => validateContentMetadata(
      { kind: "article", title: "Missing date", description: "No publication date" },
      "undated-article.mdx",
    ),
    /undated-article\.mdx.*published/i,
  )
  assert.throws(
    () => validateContentMetadata(
      { kind: "note", title: "Wrong kind", description: "Unsupported" },
      "wrong-kind.mdx",
    ),
    /wrong-kind\.mdx.*kind/i,
  )
  assert.throws(
    () => validateContentMetadata(
      { kind: "project", title: "Unverified image", description: "Unsupported", image: "/missing.png" },
      "image-project.mdx",
    ),
    /image-project\.mdx.*image.*not supported/i,
  )
  assert.throws(
    () => validateContentMetadata(
      {
        kind: "project",
        title: "Insecure link",
        description: "Unsupported protocol",
        links: [{ label: "Source", href: "http://example.com/project" }],
      },
      "insecure-project.mdx",
    ),
    /insecure-project\.mdx.*links\[0\]\.href.*https/i,
  )
})

test("MDX modules require a component and valid metadata", () => {
  /**
   * Provides the minimal renderable component required by the MDX contract.
   *
   * @returns No rendered content.
   */
  const Content = () => null
  const loaded = validateMdxModule(
    {
      default: Content,
      metadata: {
        kind: "project",
        title: "DevBook",
        description: "A source-controlled technical knowledge base.",
      },
    },
    "devbook",
    "devbook.mdx",
  )

  assert.equal(loaded.slug, "devbook")
  assert.equal(loaded.Content, Content)
  assert.equal(loaded.metadata.kind, "project")
  assert.throws(() => validateMdxModule(null, "broken", "null.mdx"), /null\.mdx.*object/i)
  assert.throws(
    () => validateMdxModule({ metadata: loaded.metadata }, "broken", "componentless.mdx"),
    /componentless\.mdx.*default component/i,
  )
})

test("slugs reject traversal and non-normalized input", () => {
  assert.equal(validateSlug("safe-content-slug", "fixture"), "safe-content-slug")
  for (const slug of ["../secrets", "nested/path", "Uppercase", "has spaces"]) {
    assert.throws(() => validateSlug(slug, "fixture"), /fixture.*slug/i)
  }
})

test("MDX discovery is deterministic and ignores unrelated files", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "portfolio-content-"))
  t.after(() => rm(directory, { force: true, recursive: true }))

  await Promise.all([
    writeFile(join(directory, "second.mdx"), "# Second\n"),
    writeFile(join(directory, "first.mdx"), "# First\n"),
    writeFile(join(directory, "notes.txt"), "ignored\n"),
  ])

  assert.deepEqual(discoverMdxSlugs(directory, "test content"), ["first", "second"])
})

test("representative repository content is discoverable", () => {
  assert.deepEqual(
    discoverMdxSlugs(join(process.cwd(), "content/articles"), "articles"),
    ["building-an-llm-evaluation-harness"],
  )
  assert.deepEqual(
    discoverMdxSlugs(join(process.cwd(), "content/projects"), "projects"),
    [
      "devbook",
      "latex-cv",
      "lifeos",
      "obsidian-colsdown",
      "obsidian-tabsdown",
      "quartz-tabsdown",
      "web-portfolio-v1",
      "web-portfolio-v2",
    ],
  )
})

test("activity snapshot parser accepts valid data", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "portfolio-activity-"))
  t.after(() => rm(directory, { force: true, recursive: true }))
  const source = join(directory, "activity.json")
  const months = Array.from({ length: 12 }, (_, index) => ({
    period: `2026-${String(index + 1).padStart(2, "0")}`,
    value: index / 12,
  })).reverse()

  await writeFile(source, JSON.stringify({ months }))

  assert.deepEqual(await loadActivitySnapshot(source), {
    available: true,
    months: months.toSorted((left, right) => left.period.localeCompare(right.period)),
  })
})

test("activity snapshot parser fails open", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "portfolio-activity-"))
  t.after(() => rm(directory, { force: true, recursive: true }))
  const malformed = join(directory, "malformed.json")
  const invalid = join(directory, "invalid.json")
  const duplicate = join(directory, "duplicate.json")
  await Promise.all([
    writeFile(malformed, "{"),
    writeFile(invalid, JSON.stringify({
      months: Array.from({ length: 12 }, (_, index) => ({
        period: `2026-${String(index + 1).padStart(2, "0")}`,
        value: index === 0 ? 1.1 : 0.5,
      })),
    })),
    writeFile(duplicate, JSON.stringify({
      months: Array.from({ length: 12 }, () => ({ period: "2026-01", value: 0.5 })),
    })),
  ])

  const warnings: string[] = []
  const warn = console.warn
  console.warn = (message) => warnings.push(String(message))
  t.after(() => { console.warn = warn })

  for (const source of [join(directory, "missing.json"), directory, malformed, invalid, duplicate]) {
    assert.deepEqual(await loadActivitySnapshot(source), { available: false })
  }
  assert.equal(warnings.length, 5)
  assert.ok(warnings.every((warning) => warning.includes(directory)))
})

test("repository omits unverified activity data and uses the approved resume release", async (t) => {
  const warn = console.warn
  console.warn = () => undefined
  t.after(() => { console.warn = warn })
  assert.deepEqual(await loadActivitySnapshot(), { available: false })

  const [primaryAction] = home.hero.actions
  assert.ok(primaryAction)
  assert.equal(
    primaryAction.href,
    "https://github.com/grafanaKibana/LatexCV/releases/latest/download/resume.pdf",
  )
})

test("one YAML document owns structured profile and approved home content", async () => {
  const yaml = await readFile(join(process.cwd(), "content", "portfolio.yaml"), "utf8")
  assert.match(yaml, /^profile:/m)
  assert.match(yaml, /^home:/m)
  assert.equal(profile.name, "Nikita Reshetnik")
  assert.equal(profile.headline, "Shipping Agents at scale")
  assert.deepEqual(profile.careerChapters, [
    {
      meta: "2024—Present · 2 roles",
      title: "AI Engineering",
      summary: "Designing and delivering production AI capabilities, evaluation systems, engineering enablement, and internal AI platforms.",
    },
    {
      meta: "2021—2024 · 5 roles",
      title: "Software Engineering",
      summary: "Progressed from internships to end-to-end ownership across .NET APIs, microservices, monoliths, plugins, SQL, releases, and team practices.",
    },
  ])
  assert.deepEqual(
    profile.experience.map(({ logo, organization, role }) => ({ logo, organization, role })),
    [
      { logo: "/companies/draftkings.svg", organization: "DraftKings", role: "Senior AI Engineer" },
      { logo: "/companies/eleks.svg", organization: "ELEKS", role: "AI Engineer" },
      { logo: "/companies/eleks.svg", organization: "ELEKS", role: "Software Engineer" },
      { logo: "/companies/eleks.svg", organization: "ELEKS", role: "Junior Software Engineer" },
      { logo: "/companies/eleks.svg", organization: "ELEKS", role: "Trainee Software Engineer" },
      { logo: "/companies/eleks.svg", organization: "ELEKS", role: "Software Engineer Intern" },
      { logo: "/companies/sigma-software.svg", organization: "Sigma Software Group", role: "Software Engineer Intern" },
    ],
  )
  assert.deepEqual(home.navigation, [
    { label: "About", href: "#about" },
    { label: "Experience", href: "#experience" },
    { label: "Education", href: "#education" },
    { label: "Skills", href: "#skills" },
    { label: "Projects", href: "#projects" },
  ])
  assert.deepEqual(home.mobileNavigation, {
    closeLabel: "Close navigation",
    triggerLabel: "Jump to section",
    defaultSectionLabel: "About",
    scrollThreshold: 260,
  })
  assert.deepEqual(home.hero.descriptors, [
    "AI Engineer",
    "Software Developer",
    "UI Design Enthusiast",
    "Open Source Contributor",
  ])
  assert.equal(home.hero.descriptorInterval, 3200)
  assert.deepEqual(home.projects, {
    label: "Selected work",
    featuredSlugs: ["devbook", "obsidian-tabsdown", "web-portfolio-v1"],
    indexTitle: "Projects",
    indexDescription: "Projects by Nikita Reshetnik across AI and software engineering.",
    caseStudyLabel: "Read case study",
    moreWorkLabel: "See other work",
    navigationLabel: "Project navigation",
    backLabel: "Back to all projects",
    homeLabel: "Home",
  })
  assert.deepEqual(home.experience, {
    label: "Experience",
    detailsLabel: "Details",
  })
  assert.deepEqual(profile.education, {
    institution: "State University of Information and Communication Technologies",
    qualification: "Bachelor of Software Engineering",
    period: "September 2019 — June 2023",
    location: "Kyiv, Ukraine",
  })
  assert.deepEqual(profile.certifications, [
    {
      title: "Azure AI Fundamentals",
      date: "August 2025",
      icon: "/certifications/microsoft-azure.svg",
      href: "https://learn.microsoft.com/api/credentials/share/en-us/nikitareshetnik/F3083C3D360731B0?sharingId=8BF347D38A5CD134",
    },
    {
      title: "GitHub Copilot",
      date: "June 2025",
      icon: "/certifications/github-copilot.svg",
      href: "https://www.credly.com/badges/ba1ea295-7465-4edc-8ca1-faa90eee9ec1/public_url",
    },
  ])
  assert.deepEqual(profile.learning, [
    { title: "Multi AI Agent Systems with crewAI", provider: "DeepLearning.AI" },
    { title: "Machine Learning in Production", provider: "DeepLearning.AI" },
    { title: "Docker and Kubernetes: The Big Picture", provider: "Pluralsight" },
    { title: "Getting Started with Docker", provider: "Pluralsight" },
    { title: "F# Track", provider: "Exercism" },
    { title: ".NET Camp", provider: "ELEKS University" },
    { title: "IT Essentials: PC Hardware and Software", provider: "Cisco Networking Academy" },
    { title: "CPA: Programming Essentials in C++", provider: "Cisco Networking Academy" },
  ])
  assert.deepEqual(home.education, {
    label: "Education",
    degreeLabel: "University degree",
    certificationsLabel: "Industry certifications",
  })
  assert.deepEqual(home.skills, { label: "Skills" })
  assert.deepEqual(profile.skills, [
    {
      title: "AI / Machine Learning",
      skills: [
        "Microsoft Agent Framework",
        "Semantic Kernel",
        "Microsoft.Extensions.AI",
        "LLM Evaluation",
        "RAG Systems",
        "Azure AI Foundry",
        "Langfuse",
      ],
    },
    { title: "Programming Languages", skills: ["C#", "Python", "TypeScript", "SQL"] },
    {
      title: "Backend & Data",
      skills: [
        ".NET",
        "ASP.NET Web API",
        "Entity Framework",
        "REST API",
        "Postman",
        "Microsoft SQL Server",
        "PostgreSQL",
        "MongoDB",
        "Elasticsearch",
        "Kafka",
      ],
    },
    {
      title: "Cloud & DevOps",
      skills: ["Microsoft Azure", "Amazon Web Services", "Vercel", "Docker", "Kubernetes", "Argo CD", "Jenkins"],
    },
    {
      title: "Observability & CI/CD",
      skills: ["Grafana", "Prometheus", "Kibana", "Azure DevOps", "GitHub Actions", "GitLab CI/CD"],
    },
    {
      title: "AI Development Tools",
      skills: ["Claude Code", "Claude Design", "Codex", "Pi", "OpenCode", "Cursor", "CodeRabbit", "GitHub Copilot"],
    },
  ])
  assert.deepEqual(home.accessibility, {
    skipToContent: "Skip to content",
    backToTop: "Back to top",
    primaryNavigation: "Primary navigation",
    mobileNavigation: "Mobile navigation",
    compactNavigation: "Compact navigation",
  })
  assert.deepEqual(
    home.hero.socialLinks.map(({ label, href }) => ({ label, href })),
    [
      { label: "LinkedIn", href: "https://www.linkedin.com/in/nikitareshetnik/" },
      { label: "Telegram", href: "https://t.me/grafanaKibana" },
      { label: "GitHub", href: "https://github.com/grafanaKibana" },
      { label: "LeetCode", href: "https://leetcode.com/u/grafanaKibana/" },
    ],
  )
  assert.deepEqual(home.footer, {
    rights: "All rights reserved.",
    localTimeLabel: "Local Time",
    locale: "en-GB",
    timeZone: "Europe/Kyiv",
  })
})
