import assert from "node:assert/strict"
import test from "node:test"

import { validatePortfolio } from "./validation"

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
