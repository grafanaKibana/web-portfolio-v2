import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import {
  loadGitHubActivity,
  parseContributionCalendar,
  parsePullRequestPage,
  type CodeContributionStatus,
  type GitHubFetch,
} from "../content/activity"
import { discoverMdxSlugs } from "../content/discovery"
import { validateMdxModule } from "../content/load"
import { validateContentMetadata } from "../content/metadata"
import { validatePortfolio } from "../content/portfolio"
import { validateSlug } from "../content/slugs"

test("valid article and project metadata is accepted", () => {
  const article = validateContentMetadata(
    {
      kind: "article",
      title: "Fixture article",
      description: "Synthetic article metadata.",
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
      title: "Fixture project",
      description: "Synthetic project metadata.",
      links: [{ label: "Source", href: "https://example.test/source" }],
    },
    "project fixture",
  )
  assert.equal(project.kind, "project")
  assert.deepEqual(project.links, [
    { label: "Source", href: "https://example.test/source" },
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
        title: "Fixture project",
        description: "Synthetic project metadata.",
      },
    },
    "fixture-project",
    "fixture-project.mdx",
  )

  assert.equal(loaded.slug, "fixture-project")
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

const pullRequestRepositories: Record<CodeContributionStatus, string> = {
  merged: "fixture-owner/merged-repository",
  "under-review": "fixture-owner/review-repository",
  draft: "fixture-owner/draft-repository",
}

/**
 * Creates one valid GitHub GraphQL pull-request node.
 *
 * @param status - Pull-request status represented by the fixture.
 * @param number - Pull-request number.
 * @returns A valid pull-request node.
 */
function pullRequestNode(status: CodeContributionStatus, number = 801): Record<string, unknown> {
  const merged = status === "merged"
  const repository = pullRequestRepositories[status]
  return {
    __typename: "PullRequest",
    number,
    title: merged ? "Fixture merged change" : "Fixture open change",
    url: `https://github.com/${repository}/pull/${String(number)}`,
    createdAt: "2026-07-03T17:38:50Z",
    mergedAt: merged ? "2026-07-17T12:52:49Z" : null,
    state: merged ? "MERGED" : "OPEN",
    isDraft: status === "draft",
    additions: 495,
    deletions: 102,
    repository: { nameWithOwner: repository, isPrivate: false },
  }
}

/**
 * Creates one valid GitHub GraphQL search page.
 *
 * @param status - Pull-request status represented by the fixture.
 * @param count - Number of pull requests in the response page.
 * @param offset - Offset used to keep generated pull-request numbers unique.
 * @param hasNextPage - Whether the fixture has another page.
 * @param endCursor - Opaque continuation cursor.
 * @returns A valid GraphQL response envelope.
 */
function pullRequestPage(
  status: CodeContributionStatus,
  count = 1,
  offset = 0,
  hasNextPage = false,
  endCursor: string | null = null,
) {
  return {
    data: {
      search: {
        nodes: Array.from({ length: count }, (_, index) =>
          pullRequestNode(status, 801 + offset + index)),
        pageInfo: { hasNextPage, endCursor },
      },
    },
  }
}

/**
 * Reads the GraphQL variables from a recorded request.
 *
 * @param init - Recorded GitHub request options.
 * @returns Parsed GraphQL variables.
 */
function requestVariables(init: Parameters<GitHubFetch>[1]): {
  document: string;
  query: string;
  cursor: string | null;
} {
  assert.ok(typeof init.body === "string")
  const body = JSON.parse(init.body) as {
    query: string;
    variables: { query: string; cursor: string | null };
  }
  return { document: body.query, ...body.variables }
}

/**
 * Identifies the pull-request status encoded in a GraphQL search query.
 *
 * @param query - GitHub search query.
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

test("GitHub response parsers validate PRs and the public contribution calendar", () => {
  for (const status of ["merged", "under-review", "draft"] as const) {
    const page = parsePullRequestPage(pullRequestPage(status), status)
    assert.deepEqual(page?.contributions, [{
      repository: pullRequestRepositories[status],
      number: 801,
      date: status === "merged" ? "2026-07-17T12:52:49Z" : "2026-07-03T17:38:50Z",
      title: status === "merged" ? "Fixture merged change" : "Fixture open change",
      href: `https://github.com/${pullRequestRepositories[status]}/pull/801`,
      additions: 495,
      deletions: 102,
    }])
  }
  const zeroCounts = pullRequestPage("merged")
  Object.assign(zeroCounts.data.search.nodes[0] ?? {}, { additions: 0, deletions: 0 })
  assert.deepEqual(parsePullRequestPage(zeroCounts, "merged")?.contributions[0], {
    repository: "fixture-owner/merged-repository",
    number: 801,
    date: "2026-07-17T12:52:49Z",
    title: "Fixture merged change",
    href: "https://github.com/fixture-owner/merged-repository/pull/801",
    additions: 0,
    deletions: 0,
  })

  const calendar = parseContributionCalendar(contributionCalendar())
  assert.equal(calendar?.length, 350)
  assert.deepEqual(calendar[0], { date: "2025-01-05", level: 0, count: 0 })
  assert.equal(parseContributionCalendar(contributionCalendar(349)), null)
  assert.equal(parseContributionCalendar("<td>changed markup</td>"), null)
})

test("GitHub GraphQL parsing rejects malformed, private, or status-inconsistent data", () => {
  const invalidRoots: unknown[] = [
    null,
    {},
    { errors: {} },
    { errors: [{ message: "partial" }], data: pullRequestPage("merged").data },
    { data: { search: { nodes: {}, pageInfo: { hasNextPage: false, endCursor: null } } } },
    { data: { search: { nodes: [], pageInfo: {} } } },
    { data: { search: { nodes: [], pageInfo: { hasNextPage: true, endCursor: null } } } },
    { data: { search: { nodes: [], pageInfo: { hasNextPage: true, endCursor: " " } } } },
  ]
  for (const value of invalidRoots) assert.equal(parsePullRequestPage(value, "merged"), null)

  const invalidNodes: Array<[CodeContributionStatus, Record<string, unknown>]> = [
    ["merged", { __typename: "Issue" }],
    ["merged", { repository: { nameWithOwner: "owner/repo", isPrivate: true } }],
    ["merged", { repository: { nameWithOwner: "bad repo", isPrivate: false } }],
    ["merged", { url: "https://example.com/pull/801" }],
    ["merged", { title: " " }],
    ["merged", { number: 0 }],
    ["merged", { createdAt: "not-a-date" }],
    ["merged", { createdAt: "2026-02-30T10:00:00Z" }],
    ["merged", { mergedAt: null }],
    ["merged", { state: "OPEN" }],
    ["merged", { isDraft: true }],
    ["under-review", { mergedAt: "2026-08-01T10:00:00Z" }],
    ["under-review", { isDraft: true }],
    ["draft", { isDraft: false }],
  ]
  for (const [status, mutation] of invalidNodes) {
    const response = pullRequestPage(status)
    Object.assign(response.data.search.nodes[0] ?? {}, mutation)
    assert.equal(parsePullRequestPage(response, status), null)
  }

  for (const field of ["additions", "deletions"] as const) {
    for (const value of [undefined, "1", -1, 0.5, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      const response = pullRequestPage("merged")
      Object.assign(response.data.search.nodes[0] ?? {}, { [field]: value })
      assert.equal(parsePullRequestPage(response, "merged"), null)
    }
  }
})

test("GitHub loading uses public status queries and bounded pagination", async () => {
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
    const { query, cursor } = requestVariables(init)
    const status = pullRequestStatus(query)
    const firstMergedPage = status === "merged" && cursor === null
    const response = pullRequestPage(status, firstMergedPage ? 2 : 1, cursor ? 2 : 0,
      firstMergedPage, firstMergedPage ? "merged-page-2" : null)
    if (firstMergedPage) {
      const oldest = response.data.search.nodes[0]
      const newest = response.data.search.nodes[1]
      assert.ok(oldest && newest)
      oldest.mergedAt = "2026-01-01T00:00:00Z"
      newest.mergedAt = "2026-08-01T00:00:00Z"
    }
    return Promise.resolve(Response.json(response))
  }
  const activity = await loadGitHubActivity("fixture-user", fetcher, "secret")
  assert.equal(activity.pullRequestsAvailable, true)
  assert.equal(activity.merged.length, 3)
  assert.equal(activity.merged[0]?.number, 802)
  assert.equal(activity.merged.at(-1)?.number, 801)
  assert.equal(activity.underReview.length, 1)
  assert.equal(activity.draft.length, 1)
  assert.equal(activity.calendarAvailable, true)
  assert.equal(activity.calendar.length, 350)
  assert.equal(requests.length, 5)
  const searchRequests = requests.filter(({ input }) => input === "https://api.github.com/graphql")
  assert.deepEqual(searchRequests.map(({ init }) => requestVariables(init).query), [
    "author:fixture-user is:pr is:merged is:public -user:fixture-user sort:updated-desc",
    "author:fixture-user is:pr is:merged is:public -user:fixture-user sort:updated-desc",
    "author:fixture-user is:pr is:open draft:false is:public -user:fixture-user sort:updated-desc",
    "author:fixture-user is:pr is:open draft:true is:public -user:fixture-user sort:updated-desc",
  ])
  assert.deepEqual(searchRequests.map(({ init }) => requestVariables(init).cursor),
    [null, "merged-page-2", null, null])
  const documents = searchRequests.map(({ init }) => requestVariables(init).document)
  assert.equal(new Set(documents).size, 1)
  assert.match(documents[0] ?? "", /first: 100/)
  for (const field of ["__typename", "number", "title", "url", "createdAt", "mergedAt", "state",
    "isDraft", "additions", "deletions", "nameWithOwner", "isPrivate", "hasNextPage", "endCursor"]) {
    assert.match(documents[0] ?? "", new RegExp(`\\b${field}\\b`))
  }
  assert.ok(searchRequests.every(({ init }) => init.method === "POST" && init.cache === "force-cache"))
  assert.ok(searchRequests.every(({ init }) =>
    new Headers(init.headers).get("Accept") === "application/vnd.github+json"))
  assert.ok(searchRequests.every(({ init }) => new Headers(init.headers).get("Content-Type") === "application/json"))
  assert.ok(searchRequests.every(({ init }) => (new Headers(init.headers).get("User-Agent")?.length ?? 0) > 0))
  assert.ok(searchRequests.every(({ init }) => new Headers(init.headers).get("X-GitHub-Api-Version") === "2022-11-28"))
  assert.ok(requests.every(({ init }) => init.next.revalidate === 300))
  assert.equal(new Headers(requests[0]?.init.headers).get("Authorization"), "Bearer secret")
})

test("GitHub loading never requests beyond page ten", async () => {
  const mergedCursors: Array<string | null> = []
  /**
   * Returns full merged pages while recording requested page numbers.
   *
   * @param input - Requested GitHub URL.
   * @param init - Request options containing the GraphQL cursor.
   * @returns The matching fixture response.
   */
  const fetcher: GitHubFetch = (input, init) => {
    if (input.includes("/contributions")) return Promise.resolve(new Response(contributionCalendar()))
    const { query, cursor } = requestVariables(init)
    const status = pullRequestStatus(query)
    const page = cursor ? Number(cursor.split("-").at(-1)) + 1 : 1
    if (status === "merged") mergedCursors.push(cursor)
    const count = status === "merged" ? 100 : 1
    const response = pullRequestPage(
      status,
      count,
      (page - 1) * 100,
      status === "merged",
      `merged-${String(page)}`,
    )
    if (status === "merged") {
      for (const node of response.data.search.nodes) {
        node.mergedAt = new Date(Date.UTC(2026, 0, 1) + Number(node.number) * 1_000).toISOString()
      }
    }
    return Promise.resolve(Response.json(response))
  }

  const activity = await loadGitHubActivity("fixture-user", fetcher, "secret")
  assert.equal(activity.pullRequestsAvailable, true)
  assert.equal(activity.merged.length, 1_000)
  assert.deepEqual(mergedCursors, [null, "merged-1", "merged-2", "merged-3", "merged-4",
    "merged-5", "merged-6", "merged-7", "merged-8", "merged-9"])
  assert.equal(activity.merged[0]?.number, 1_800)
  assert.equal(activity.merged.at(-1)?.number, 801)
})

test("GitHub loading keeps PR and calendar failures independent", async (t) => {
  const warnings: string[] = []
  const warn = console.warn
  console.warn = (message) => warnings.push(String(message))
  t.after(() => { console.warn = warn })

  const calendarOnly = await loadGitHubActivity("fixture-user", (input, init) => {
    if (input.includes("/contributions")) return Promise.resolve(new Response(contributionCalendar()))
    const { query } = requestVariables(init)
    if (query.includes("draft:true")) {
      return Promise.resolve(Response.json({ errors: [{ message: "failed" }] }))
    }
    return Promise.resolve(Response.json(pullRequestPage(
      query.includes("is:merged") ? "merged" : "under-review",
    )))
  }, "secret")
  assert.deepEqual(calendarOnly, {
    pullRequestsAvailable: false,
    merged: [],
    underReview: [],
    draft: [],
    calendarAvailable: true,
    calendar: parseContributionCalendar(contributionCalendar()),
  })

  const pullRequestsOnly = await loadGitHubActivity("fixture-user", (input, init) => {
    if (input.includes("/contributions")) return Promise.resolve(new Response(null, { status: 503 }))
    const { query } = requestVariables(init)
    const status = pullRequestStatus(query)
    return Promise.resolve(Response.json(pullRequestPage(status)))
  }, "secret")
  assert.equal(pullRequestsOnly.pullRequestsAvailable, true)
  assert.equal(pullRequestsOnly.merged.length, 1)
  assert.equal(pullRequestsOnly.underReview.length, 1)
  assert.equal(pullRequestsOnly.draft.length, 1)
  assert.equal(pullRequestsOnly.calendarAvailable, false)
  assert.deepEqual(pullRequestsOnly.calendar, [])
  assert.equal(warnings.length, 2)
})

test("missing tokens skip GraphQL while malformed responses suppress all PR groups", async (t) => {
  const warn = console.warn
  console.warn = () => undefined
  t.after(() => { console.warn = warn })

  for (const token of [undefined, "   "]) {
    let graphQlRequests = 0
    const activity = await loadGitHubActivity("fixture-user", (input) => {
      if (input.includes("/contributions")) return Promise.resolve(new Response(contributionCalendar()))
      graphQlRequests += 1
      return Promise.resolve(Response.json(pullRequestPage("merged")))
    }, token)
    assert.equal(graphQlRequests, 0)
    assert.equal(activity.pullRequestsAvailable, false)
    assert.equal(activity.calendarAvailable, true)
  }

  for (const failure of [
    () => new Response(null, { status: 503 }),
    () => Response.json({ data: { search: { nodes: [], pageInfo: { hasNextPage: true, endCursor: "same" } } } }),
  ]) {
    let requestCount = 0
    const activity = await loadGitHubActivity("fixture-user", (input) => {
      if (input.includes("/contributions")) return Promise.resolve(new Response(contributionCalendar()))
      requestCount += 1
      return Promise.resolve(failure())
    }, "secret")
    assert.equal(activity.pullRequestsAvailable, false)
    assert.deepEqual([activity.merged, activity.underReview, activity.draft], [[], [], []])
    assert.equal(activity.calendarAvailable, true)
    assert.ok(requestCount >= 1)
  }
})

/**
 * Creates a complete synthetic portfolio document for validator tests.
 *
 * @returns A valid untrusted portfolio input.
 */
function portfolioFixture(): Record<string, unknown> {
  return {
    profile: {
      name: "Fixture Person",
      headline: "Fixture headline",
      summary: ["Fixture summary"],
      careerChapters: [
        { id: "current", title: "Current chapter", summary: "Current summary" },
        { id: "past", title: "Past chapter", summary: "Past summary" },
      ],
      facts: [{ label: "Fixture fact", value: "Fixture value" }],
      recommendations: [{ author: "Fixture Author", position: "Fixture Position", quote: "Fixture quote" }],
      experience: [
        {
          organization: "Fixture Organization",
          logo: "/fixture/current.svg",
          role: "Ongoing fixture role",
          chapter: "current",
          start: "2024-02",
          end: null,
          summary: "Ongoing fixture summary",
          highlights: ["Current highlight"],
        },
        {
          organization: "Fixture Organization",
          logo: "/fixture/previous.svg",
          role: "Previous role",
          chapter: "past",
          start: "2021-01",
          end: "2023-12",
          summary: "Previous role summary",
          highlights: ["Previous highlight"],
        },
      ],
      education: {
        institution: "Fixture School",
        qualification: "Fixture Qualification",
        start: "2018-09",
        end: "2022-06",
        location: "Fixture City",
      },
      certifications: [{
        title: "Fixture Certificate",
        date: "2025-03",
        icon: "/fixture/certificate.svg",
        href: "https://example.test/certificate",
      }],
      learning: [{ title: "Fixture Course", provider: "Fixture Provider" }],
      skills: [{ title: "Fixture Skills", skills: ["Fixture Skill"] }],
      links: [{ label: "Fixture Link", href: "https://example.test/profile" }],
    },
    home: {
      metadataDescription: "Fixture metadata",
      mobileNavigation: { scrollThreshold: 240 },
      hero: {
        availability: { status: "Available", qualifier: "Fixture qualifier" },
        title: "Fixture title",
        lead: "Fixture lead",
        descriptors: ["Fixture descriptor"],
        descriptorInterval: 3_000,
        resumeHref: "https://example.test/resume.pdf",
      },
      projects: {
        featuredSlugs: ["fixture-project"],
        indexDescription: "Fixture project index",
      },
      codeActivity: { username: "fixture-user" },
      writing: { indexDescription: "Fixture article index" },
      contact: { description: "Fixture contact", email: "fixture@example.test" },
      footer: { locale: "en-US", timeZone: "UTC" },
    },
  }
}

test("portfolio validation accepts a complete document and derives date presentation", () => {
  const content = validatePortfolio(portfolioFixture())

  assert.equal(content.profile.experience[0]?.period, "February 2024 — Present")
  assert.equal(content.profile.experience[1]?.period, "January 2021 — December 2023")
  assert.deepEqual(content.profile.careerChapters.map(({ id, meta }) => ({ id, meta })), [
    { id: "current", meta: "2024—Present · 1 role" },
    { id: "past", meta: "2021—2023 · 1 role" },
  ])
  assert.equal(content.profile.certifications[0]?.date, "March 2025")
  assert.deepEqual(content.home.projects.featuredSlugs, ["fixture-project"])
})

test("portfolio validation rejects malformed and reversed calendar months", () => {
  const cases = [
    { field: "start", value: "2026-13", message: /profile\.experience\[0\]\.start must use ISO 8601 YYYY-MM format/ },
    { field: "start", value: "April 2026", message: /profile\.experience\[0\]\.start must use ISO 8601 YYYY-MM format/ },
    { field: "end", value: "2024-01", message: /profile\.experience\[0\]\.end must not precede profile\.experience\[0\]\.start/ },
  ] as const

  for (const { field, value, message } of cases) {
    const fixture = portfolioFixture() as {
      profile: { experience: Array<{ end: unknown; start: unknown }> }
    }
    const experience = fixture.profile.experience[0]
    assert.ok(experience)
    experience[field] = value
    assert.throws(() => validatePortfolio(fixture), message)
  }
})

test("portfolio validation enforces chapter and hero invariants", () => {
  const duplicateChapters = portfolioFixture() as {
    profile: { careerChapters: Array<{ id: string }> }
  }
  const secondChapter = duplicateChapters.profile.careerChapters[1]
  assert.ok(secondChapter)
  secondChapter.id = "current"
  assert.throws(() => validatePortfolio(duplicateChapters), /careerChapters ids must be unique/)

  const missingRole = portfolioFixture() as {
    profile: { careerChapters: Array<{ id: string; title: string; summary: string }> }
  }
  missingRole.profile.careerChapters.push({
    id: "unused",
    title: "Unused chapter",
    summary: "Unused chapter summary",
  })
  assert.throws(() => validatePortfolio(missingRole), /must have at least one matching experience/)

  const emptyDescriptors = portfolioFixture() as {
    home: { hero: { descriptors: string[] } }
  }
  emptyDescriptors.home.hero.descriptors = []
  assert.throws(() => validatePortfolio(emptyDescriptors), /hero\.descriptors must not be empty/)
})
