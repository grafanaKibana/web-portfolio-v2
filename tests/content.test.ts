import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { load } from "js-yaml"

import {
  loadGitHubActivity,
  parseContributionCalendar,
  parsePullRequestSearch,
  type CodeContributionStatus,
  type GitHubFetch,
} from "../content/activity"
import { discoverMdxSlugs } from "../content/discovery"
import { validateMdxModule } from "../content/load"
import { validateContentMetadata } from "../content/metadata"
import { validateSlug } from "../content/slugs"
import { home, profile, validatePortfolio } from "../content/structured"

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
    [
      "building-an-llm-evaluation-harness",
      "fixing-bugs-with-mcps",
      "microsoft-agent-framework-setup",
    ],
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

/**
 * Creates one valid GitHub Search API fixture.
 *
 * @param status - Pull-request status represented by the fixture.
 * @param count - Number of pull requests in the response page.
 * @param offset - Offset used to keep generated pull-request numbers unique.
 * @returns A valid search response.
 */
function pullRequestSearch(status: CodeContributionStatus, count = 1, offset = 0) {
  const merged = status === "merged"
  let repository = "Dygmalab/Bazecor"
  if (merged) repository = "oleeskild/obsidian-digital-garden"
  else if (status === "draft") repository = "microsoft/semantic-kernel"
  return {
    incomplete_results: false,
    items: Array.from({ length: count }, (_, index) => {
      const number = (merged ? 801 : 1092) + offset + index;
      return {
        number,
        title: merged ? "feat: add content base directory" : "fix: enhance RGB to RGBW conversion",
        html_url: `https://github.com/${repository}/pull/${String(number)}`,
        repository_url: `https://api.github.com/repos/${repository}`,
        state: merged ? "closed" : "open",
        created_at: "2026-07-03T17:38:50Z",
        pull_request: {
          merged_at: merged ? "2026-07-17T12:52:49Z" : null,
          url: `https://api.github.com/repos/${repository}/pulls/${String(number)}`,
        },
      }
    }),
  }
}

/**
 * Identifies the pull-request status encoded in a search query.
 *
 * @param query - GitHub Search API query.
 * @returns The represented pull-request status.
 */
function pullRequestStatus(query: string): CodeContributionStatus {
  if (query.includes("is:merged")) return "merged"
  if (query.includes("draft:true")) return "draft"
  return "under-review"
}

/**
 * Creates consecutive public GitHub contribution cells beginning on Sunday.
 *
 * @param dayCount - Number of calendar cells to create.
 * @returns Valid public contribution-calendar markup.
 */
function contributionCalendar(dayCount = 350): string {
  const start = Date.UTC(2025, 0, 5)
  const days = Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(start + index * 86_400_000).toISOString().slice(0, 10)
    const count = index % 7
    const label = count === 0 ? "No contributions" : `${String(count)} ${count === 1 ? "contribution" : "contributions"}`
    return {
      cell: `<td id="day-${String(index)}" data-date="${date}" data-level="${String(index % 5)}" class="ContributionCalendar-day">`,
      tooltip: `<tool-tip for="day-${String(index)}">${label} on January 1st.</tool-tip>`,
    }
  })
  return `${days.toReversed().map(({ cell }) => cell).join("")} ${days.map(({ tooltip }) => tooltip).join("")}`
}

test("live GitHub parsers validate PRs and the public contribution calendar", () => {
  assert.deepEqual(parsePullRequestSearch(pullRequestSearch("merged"), "merged"), [{
    repository: "oleeskild/obsidian-digital-garden",
    number: 801,
    date: "2026-07-17T12:52:49Z",
    title: "feat: add content base directory",
    href: "https://github.com/oleeskild/obsidian-digital-garden/pull/801",
  }])
  assert.deepEqual(parsePullRequestSearch(pullRequestSearch("under-review"), "under-review"), [{
    repository: "Dygmalab/Bazecor",
    number: 1092,
    date: "2026-07-03T17:38:50Z",
    title: "fix: enhance RGB to RGBW conversion",
    href: "https://github.com/Dygmalab/Bazecor/pull/1092",
  }])
  assert.deepEqual(parsePullRequestSearch(pullRequestSearch("draft"), "draft"), [{
    repository: "microsoft/semantic-kernel",
    number: 1092,
    date: "2026-07-03T17:38:50Z",
    title: "fix: enhance RGB to RGBW conversion",
    href: "https://github.com/microsoft/semantic-kernel/pull/1092",
  }])
  for (const status of ["under-review", "draft"] as const) {
    const response = pullRequestSearch(status)
    const item = response.items[0]
    assert.ok(item)
    item.pull_request.merged_at = "2026-08-01T10:00:00Z"
    assert.equal(parsePullRequestSearch(response, status)?.[0]?.date, item.created_at)
  }
  assert.equal(parsePullRequestSearch(pullRequestSearch("under-review"), "merged"), null)
  assert.equal(parsePullRequestSearch({ incomplete_results: true, items: [] }, "under-review"), null)
  assert.equal(parsePullRequestSearch({ incomplete_results: false, items: {} }, "draft"), null)

  for (const status of ["merged", "under-review", "draft"] as const) {
    for (const pullRequest of [undefined, null, [], "not a pull request", {}]) {
      const response = pullRequestSearch(status)
      const item = response.items[0]
      assert.ok(item)
      Object.assign(item, { pull_request: pullRequest })
      assert.equal(parsePullRequestSearch(response, status), null)
    }
  }

  const calendar = parseContributionCalendar(contributionCalendar())
  assert.equal(calendar?.length, 350)
  assert.deepEqual(calendar[0], { date: "2025-01-05", level: 0, count: 0 })
  assert.equal(parseContributionCalendar(contributionCalendar(349)), null)
  assert.equal(parseContributionCalendar("<td>changed markup</td>"), null)
})

test("live GitHub loading uses public status queries and bounded pagination", async () => {
  const requests: Array<{ input: string; init: Parameters<GitHubFetch>[1] }> = []
  /**
   * Returns deterministic GitHub responses while recording request options.
   *
   * @param input - Requested GitHub URL.
   * @param init - Request options passed by the loader.
   * @returns The matching fixture response.
   */
  const fetcher: GitHubFetch = (input, init) => {
    requests.push({ input, init })
    if (input.includes("/contributions")) return Promise.resolve(new Response(contributionCalendar()))
    const url = new URL(input)
    const query = url.searchParams.get("q") ?? ""
    const page = Number(url.searchParams.get("page"))
    const status = pullRequestStatus(query)
    const count = status === "merged" && page === 1 ? 100 : 1
    const response = pullRequestSearch(status, count, (page - 1) * 100)
    if (status === "merged" && page === 1) {
      const oldest = response.items[0]
      const newest = response.items[1]
      assert.ok(oldest && newest)
      oldest.pull_request.merged_at = "2026-01-01T00:00:00Z"
      newest.pull_request.merged_at = "2026-08-01T00:00:00Z"
    }
    return Promise.resolve(Response.json(response))
  }
  const activity = await loadGitHubActivity("grafanaKibana", fetcher, "secret")
  assert.equal(activity.pullRequestsAvailable, true)
  assert.equal(activity.merged.length, 101)
  assert.equal(activity.merged[0]?.number, 802)
  assert.equal(activity.merged.at(-1)?.number, 801)
  assert.equal(activity.underReview.length, 1)
  assert.equal(activity.draft.length, 1)
  assert.equal(activity.calendarAvailable, true)
  assert.equal(activity.calendar.length, 350)
  assert.equal(requests.length, 5)
  const searchRequests = requests.filter(({ input }) => input.includes("/search/issues"))
  assert.deepEqual(searchRequests.map(({ input }) => new URL(input).searchParams.get("q")), [
    "author:grafanaKibana is:pr is:merged is:public -user:grafanaKibana",
    "author:grafanaKibana is:pr is:merged is:public -user:grafanaKibana",
    "author:grafanaKibana is:pr is:open draft:false is:public -user:grafanaKibana",
    "author:grafanaKibana is:pr is:open draft:true is:public -user:grafanaKibana",
  ])
  assert.ok(searchRequests.every(({ input }) => new URL(input).searchParams.get("per_page") === "100"))
  assert.deepEqual(searchRequests.map(({ input }) => new URL(input).searchParams.get("page")), ["1", "2", "1", "1"])
  assert.ok(searchRequests.every(({ init }) =>
    new Headers(init.headers).get("Accept") === "application/vnd.github+json"))
  assert.ok(searchRequests.every(({ init }) =>
    !new Headers(init.headers).get("Accept")?.includes("text")))
  assert.ok(requests.every(({ init }) => init.next.revalidate === 300))
  assert.equal(new Headers(requests[0]?.init.headers).get("Authorization"), "Bearer secret")
})

test("live GitHub loading never requests beyond page ten", async () => {
  const searchPages: number[] = []
  /**
   * Returns full merged pages while recording requested page numbers.
   *
   * @param input - Requested GitHub URL.
   * @returns The matching fixture response.
   */
  const fetcher: GitHubFetch = (input) => {
    if (input.includes("/contributions")) return Promise.resolve(new Response(contributionCalendar()))
    const url = new URL(input)
    const query = url.searchParams.get("q") ?? ""
    const page = Number(url.searchParams.get("page"))
    searchPages.push(page)
    const status = pullRequestStatus(query)
    const count = status === "merged" ? 100 : 1
    return Promise.resolve(Response.json(pullRequestSearch(status, count, (page - 1) * 100)))
  }

  const activity = await loadGitHubActivity("grafanaKibana", fetcher)
  assert.equal(activity.merged.length, 1_000)
  assert.equal(Math.max(...searchPages), 10)
  assert.equal(searchPages.filter((page) => page === 10).length, 1)
})

test("live GitHub loading keeps PR and calendar failures independent", async (t) => {
  const warnings: string[] = []
  const warn = console.warn
  console.warn = (message) => warnings.push(String(message))
  t.after(() => { console.warn = warn })

  const calendarOnly = await loadGitHubActivity("grafanaKibana", (input) => {
    if (input.includes("/contributions")) return Promise.resolve(new Response(contributionCalendar()))
    const query = new URL(input).searchParams.get("q") ?? ""
    if (query.includes("draft:true")) {
      return Promise.resolve(Response.json({ incomplete_results: true, items: [] }))
    }
    return Promise.resolve(Response.json(pullRequestSearch(
      query.includes("is:merged") ? "merged" : "under-review",
    )))
  })
  assert.deepEqual(calendarOnly, {
    pullRequestsAvailable: false,
    merged: [],
    underReview: [],
    draft: [],
    calendarAvailable: true,
    calendar: parseContributionCalendar(contributionCalendar()),
  })

  const pullRequestsOnly = await loadGitHubActivity("grafanaKibana", (input) => {
    if (input.includes("/contributions")) return Promise.resolve(new Response(null, { status: 503 }))
    const query = new URL(input).searchParams.get("q") ?? ""
    const status = pullRequestStatus(query)
    return Promise.resolve(Response.json(pullRequestSearch(status)))
  })
  assert.equal(pullRequestsOnly.pullRequestsAvailable, true)
  assert.equal(pullRequestsOnly.merged.length, 1)
  assert.equal(pullRequestsOnly.underReview.length, 1)
  assert.equal(pullRequestsOnly.draft.length, 1)
  assert.equal(pullRequestsOnly.calendarAvailable, false)
  assert.deepEqual(pullRequestsOnly.calendar, [])
  assert.equal(warnings.length, 2)
})

test("repository keeps live activity out of YAML and uses the approved resume release", async () => {
  const yaml = await readFile(join(process.cwd(), "content", "portfolio.yaml"), "utf8")
  assert.doesNotMatch(yaml, /github\.com\/.+\/pull\/\d+/)
  assert.doesNotMatch(yaml, /\d+ merged · \d+ under review/)
  assert.equal(
    home.hero.resumeHref,
    "https://github.com/grafanaKibana/LatexCV/releases/latest/download/resume.pdf",
  )
})

test("portfolio YAML contains personal data and configuration, not interface copy", async () => {
  const yaml = await readFile(join(process.cwd(), "content", "portfolio.yaml"), "utf8")
  const document = load(yaml) as {
    home?: Record<string, unknown>
    profile?: {
      certifications?: Array<{ date?: unknown }>
      education?: { end?: unknown; start?: unknown }
      experience?: Array<{ end?: unknown; period?: unknown; start?: unknown }>
      recommendations?: Array<{ author?: unknown; position?: unknown; quote?: unknown }>
    }
  }
  const sourceHome = document.home ?? {}
  const sourceProfile = document.profile ?? {}
  assert.match(yaml, /^profile:/m)
  assert.match(yaml, /^home:/m)
  assert.deepEqual(Object.keys(sourceHome), [
    "metadataDescription",
    "mobileNavigation",
    "hero",
    "projects",
    "codeActivity",
    "writing",
    "contact",
    "footer",
  ])
  assert.deepEqual(sourceHome.mobileNavigation, { scrollThreshold: 260 })
  assert.deepEqual(Object.keys(sourceHome.hero as Record<string, unknown>), [
    "availability",
    "title",
    "lead",
    "descriptors",
    "descriptorInterval",
    "resumeHref",
  ])
  assert.deepEqual(Object.keys(sourceHome.projects as Record<string, unknown>), [
    "featuredSlugs",
    "indexDescription",
  ])
  assert.deepEqual(Object.keys(sourceHome.codeActivity as Record<string, unknown>), ["username"])
  assert.deepEqual(Object.keys(sourceHome.writing as Record<string, unknown>), ["indexDescription"])
  assert.deepEqual(Object.keys(sourceHome.contact as Record<string, unknown>), ["description", "email"])
  assert.deepEqual(Object.keys(sourceHome.footer as Record<string, unknown>), ["locale", "timeZone"])
  assert.ok(sourceProfile.experience?.every(({ end, period, start }) =>
    period === undefined
    && typeof start === "string"
    && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(start)
    && (end === null || typeof end === "string" && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(end))))
  assert.match(String(sourceProfile.education?.start), /^\d{4}-(?:0[1-9]|1[0-2])$/)
  assert.match(String(sourceProfile.education?.end), /^\d{4}-(?:0[1-9]|1[0-2])$/)
  assert.ok(sourceProfile.certifications?.every(({ date }) =>
    typeof date === "string" && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(date)))
  assert.ok(sourceProfile.recommendations?.every(({ author, position, quote }) =>
    typeof author === "string" && author.length > 0
    && typeof position === "string" && position.length > 0
    && typeof quote === "string" && quote.length > 0))

  const unquotedStringValues = yaml.split("\n").flatMap((line, index) => {
    const match = /^\s*(?:-\s+)?([\w]+):\s+(.+)$/.exec(line)
    if (!match?.[1] || !match[2]) return []
    const [, key, value] = match
    if (["id", "chapter"].includes(key)
      || /^(?:"|'|\[|\{|\/|null$|\d)/.test(value)) return []
    return [`${String(index + 1)}: ${line.trim()}`]
  })
  assert.deepEqual(unquotedStringValues, [])
})

test("portfolio rejects malformed and reversed ISO calendar months", async () => {
  const yaml = await readFile(join(process.cwd(), "content", "portfolio.yaml"), "utf8")
  const source = load(yaml) as {
    profile: { experience: Array<{ end: unknown; start: unknown }> }
  }
  const invalidMonth = structuredClone(source)
  const invalidMonthExperience = invalidMonth.profile.experience[0]
  assert.ok(invalidMonthExperience)
  invalidMonthExperience.start = "2026-13"
  assert.throws(
    () => validatePortfolio(invalidMonth),
    /content\/portfolio\.yaml: profile\.experience\[0\]\.start must use ISO 8601 YYYY-MM format/,
  )

  const malformedMonth = structuredClone(source)
  const malformedMonthExperience = malformedMonth.profile.experience[0]
  assert.ok(malformedMonthExperience)
  malformedMonthExperience.start = "April 2026"
  assert.throws(
    () => validatePortfolio(malformedMonth),
    /content\/portfolio\.yaml: profile\.experience\[0\]\.start must use ISO 8601 YYYY-MM format/,
  )

  const reversedRange = structuredClone(source)
  const reversedRangeExperience = reversedRange.profile.experience[1]
  assert.ok(reversedRangeExperience)
  reversedRangeExperience.end = "2024-10"
  assert.throws(
    () => validatePortfolio(reversedRange),
    /content\/portfolio\.yaml: profile\.experience\[1\]\.end must not precede profile\.experience\[1\]\.start/,
  )
})

test("one YAML document owns structured profile and approved personal content", () => {
  assert.equal(profile.name, "Nikita Reshetnik")
  assert.equal(profile.headline, "Shipping Agents at scale")
  assert.deepEqual(profile.careerChapters, [
    {
      id: "ai",
      meta: "2024—Present · 2 roles",
      title: "AI Engineering",
      summary: "Designing and delivering production AI capabilities, evaluation systems, engineering enablement, and internal AI platforms.",
    },
    {
      id: "software",
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
  assert.deepEqual(home.mobileNavigation, { scrollThreshold: 260 })
  assert.deepEqual(home.hero.descriptors, [
    "AI Engineer",
    "Software Developer",
    "UI Design Enthusiast",
    "Open Source Contributor",
  ])
  assert.equal(home.hero.descriptorInterval, 3200)
  assert.deepEqual(home.projects, {
    featuredSlugs: ["devbook", "obsidian-tabsdown", "web-portfolio-v1"],
    indexDescription: "Projects by Nikita Reshetnik across AI and software engineering.",
  })
  assert.deepEqual(home.writing, {
    indexDescription: "Articles by Nikita Reshetnik about AI and software engineering.",
  })
  assert.deepEqual(profile.recommendations, [
    {
      author: "Khrystyna Velychko",
      position: "Senior Project Manager | PMI Rising Leader ’24",
      quote: "I worked with Nikita for over 2 years and I would strongly recommend to work with him as a software engineer. I want to emphasize that Nikita is not just a developer who writes code - he is a true engineer, curious about modern problems, innovative technologies and is always ready to take on new challenges. Nikita is eager to gain new knowledge that might be helpful in his line of work, which makes him a valuable asset for every team.",
    },
    {
      author: "Yaroslav Zubets",
      position: "Software Engineer @ Meta",
      quote: "I had the pleasure of working with Nikita and can confidently say that he is a highly talented and driven professional. Despite being early in his career, he demonstrates exceptional analytical skills and a mature, thoughtful approach to problem-solving. He has strong ability to think outside the box when the situation calls for it. He consistently brought fresh, well-grounded ideas to the table that added real value to our work. Collaborating with him was both productive and enjoyable. He’s a quick learner, proactive, and has great potential for growth.",
    },
    {
      author: "Antony Melnyk",
      position: "Software Developer, Assistant Lecturer",
      quote: "It is a great pleasure working with Nikita. Nikita is result-oriented, a fast learner, and often completes tasks much faster than expected. Nikita is also great at team communication and collaboration. Highly recommend Nikita.",
    },
  ])
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
  assert.deepEqual(profile.skills, [
    {
      title: "AI / Machine Learning",
      skills: [
        "Microsoft Agent Framework",
        "Semantic Kernel",
        "Microsoft.Extensions.AI",
        "Large Language Models",
        "LLM Evaluation",
        "Retrieval-Augmented Generation",
        "Azure AI Foundry",
        "Langfuse",
      ],
    },
    { title: "Programming Languages", skills: ["C#", "Python", "TypeScript", "SQL"] },
    {
      title: "Backend",
      skills: [
        ".NET",
        "ASP.NET Web API",
        "Entity Framework",
        "REST API",
      ],
    },
    {
      title: "Data",
      skills: [
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
  assert.deepEqual(
    profile.links,
    [
      { label: "LinkedIn", href: "https://www.linkedin.com/in/nikitareshetnik/" },
      { label: "Telegram", href: "https://t.me/grafanaKibana" },
      { label: "GitHub", href: "https://github.com/grafanaKibana" },
      { label: "LeetCode", href: "https://leetcode.com/u/grafanaKibana/" },
    ],
  )
  assert.deepEqual(home.footer, {
    locale: "en-GB",
    timeZone: "Europe/Kyiv",
  })
})
