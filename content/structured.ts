import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load } from "js-yaml";

const monthFormatter = new Intl.DateTimeFormat("en", {
  month: "long",
  timeZone: "UTC",
  year: "numeric",
});

export interface ExternalLink {
  label: string;
  href: string;
}

export interface Experience {
  organization: string;
  logo: string;
  role: string;
  chapter: string;
  start: string;
  end: string | null;
  period: string;
  summary: string;
  highlights: readonly string[];
}

export interface CareerChapter {
  id: string;
  meta: string;
  title: string;
  summary: string;
}

export interface Education {
  institution: string;
  qualification: string;
  period: string;
  location: string;
}

export interface SkillGroup {
  title: string;
  skills: readonly string[];
}

export interface Recommendation {
  author: string;
  position: string;
  quote: string;
}

export interface PortfolioProfile {
  name: string;
  headline: string;
  summary: readonly string[];
  careerChapters: readonly CareerChapter[];
  facts: readonly { label: string; value: string }[];
  recommendations: readonly Recommendation[];
  experience: readonly Experience[];
  education: Education;
  certifications: readonly { title: string; date: string; icon: string; href: string }[];
  learning: readonly { title: string; provider: string }[];
  skills: readonly SkillGroup[];
  links: readonly ExternalLink[];
}

export interface HomeContent {
  metadataDescription: string;
  mobileNavigation: {
    scrollThreshold: number;
  };
  hero: {
    availability: { status: string; qualifier: string };
    title: string;
    lead: string;
    descriptors: readonly string[];
    descriptorInterval: number;
    resumeHref: string;
  };
  projects: {
    featuredSlugs: readonly string[];
    indexDescription: string;
  };
  codeActivity: {
    username: string;
  };
  writing: {
    indexDescription: string;
  };
  contact: {
    description: string;
    email: string;
  };
  footer: {
    locale: string;
    timeZone: string;
  };
}

type RecordValue = Record<string, unknown>;

/**
 * Returns an object field or throws a source-specific content error.
 *
 * @param value - Untrusted YAML value.
 * @param path - Human-readable field path.
 * @returns The validated object.
 * @throws When the value is not an object.
 */
function record(value: unknown, path: string): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`content/portfolio.yaml: ${path} must be an object`);
  }
  return value as RecordValue;
}

/**
 * Returns a string field or throws a source-specific content error.
 *
 * @param value - Untrusted YAML value.
 * @param path - Human-readable field path.
 * @returns The validated non-empty string.
 * @throws When the value is not a non-empty string.
 */
function string(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`content/portfolio.yaml: ${path} must be a non-empty string`);
  }
  return value;
}

/**
 * Returns a finite number field or throws a source-specific content error.
 *
 * @param value - Untrusted YAML value.
 * @param path - Human-readable field path.
 * @returns The validated finite number.
 * @throws When the value is not a finite number.
 */
function number(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`content/portfolio.yaml: ${path} must be a number`);
  }
  return value;
}

/**
 * Validates an ISO 8601 calendar month.
 *
 * @param value - Untrusted month value.
 * @param path - Human-readable field path.
 * @returns The validated `YYYY-MM` month.
 * @throws When the value is not a valid calendar month.
 */
function calendarMonth(value: unknown, path: string): string {
  if (typeof value !== "string" || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(value)) {
    throw new Error(`content/portfolio.yaml: ${path} must use ISO 8601 YYYY-MM format`);
  }
  return value;
}

/**
 * Formats a validated calendar month for display.
 *
 * @param value - Validated `YYYY-MM` month.
 * @returns The month and year in the current portfolio style.
 */
function formatMonth(value: string): string {
  return monthFormatter.format(new Date(`${value}-01T00:00:00Z`));
}

/**
 * Validates and formats one start/end month range.
 *
 * @param value - Record containing ISO start and end months.
 * @param path - Human-readable field path.
 * @returns Validated source months plus their presentation-ready period.
 * @throws When either month is invalid or the range is reversed.
 */
function monthRange(value: RecordValue, path: string): { start: string; end: string | null; period: string } {
  const start = calendarMonth(value.start, `${path}.start`);
  const end = value.end === null ? null : calendarMonth(value.end, `${path}.end`);
  if (end !== null && end < start) throw new Error(`content/portfolio.yaml: ${path}.end must not precede ${path}.start`);
  return {
    start,
    end,
    period: `${formatMonth(start)} — ${end === null ? "Present" : formatMonth(end)}`,
  };
}

/**
 * Calculates a chapter's year span and role count from its experience records.
 *
 * @param roles - Experience records assigned to one career chapter.
 * @param path - Human-readable chapter path.
 * @returns A compact derived chapter summary.
 * @throws When the chapter has no assigned roles.
 */
function careerChapterMeta(roles: readonly Experience[], path: string): string {
  if (!roles.length) throw new Error(`content/portfolio.yaml: ${path} must have at least one matching experience`);
  const start = Math.min(...roles.map((role) => Number(role.start.slice(0, 4))));
  const present = roles.some((role) => role.end === null);
  const end = present
    ? "Present"
    : String(Math.max(...roles.map((role) => Number((role.end ?? role.start).slice(0, 4)))));
  return `${String(start)}—${end} · ${String(roles.length)} ${roles.length === 1 ? "role" : "roles"}`;
}

/**
 * Maps an array field or throws a source-specific content error.
 *
 * @typeParam T - Parsed array item type.
 * @param value - Untrusted YAML value.
 * @param path - Human-readable field path.
 * @param parse - Item validator.
 * @returns The validated array.
 * @throws When the value is not an array or an item is invalid.
 */
function array<T>(value: unknown, path: string, parse: (item: unknown, path: string) => T): T[] {
  if (!Array.isArray(value)) throw new Error(`content/portfolio.yaml: ${path} must be an array`);
  return value.map((item, index) => parse(item, `${path}[${String(index)}]`));
}

/**
 * Parses a labeled hyperlink from YAML.
 *
 * @param value - Untrusted YAML link value.
 * @param path - Human-readable field path.
 * @returns The validated labeled link.
 * @throws When the link shape is invalid.
 */
function link(value: unknown, path: string): ExternalLink {
  const item = record(value, path);
  return { label: string(item.label, `${path}.label`), href: string(item.href, `${path}.href`) };
}

/**
 * Parses the validated profile branch of the portfolio document.
 *
 * @param sourceProfile - Untrusted profile record from the YAML root.
 * @returns The validated portfolio profile.
 * @throws When a required profile field is missing or malformed.
 */
function parseProfile(sourceProfile: RecordValue): PortfolioProfile {
  const education = record(sourceProfile.education, "profile.education");
  const chapterDefinitions = array(sourceProfile.careerChapters, "profile.careerChapters", (value, path) => {
    const item = record(value, path);
    return {
      id: string(item.id, `${path}.id`),
      title: string(item.title, `${path}.title`),
      summary: string(item.summary, `${path}.summary`),
    };
  });
  const chapterIds = new Set(chapterDefinitions.map(({ id }) => id));
  if (chapterIds.size !== chapterDefinitions.length) {
    throw new Error("content/portfolio.yaml: profile.careerChapters ids must be unique");
  }
  const experience = array(sourceProfile.experience, "profile.experience", (value, path) => {
    const item = record(value, path);
    const chapter = string(item.chapter, `${path}.chapter`);
    const dates = monthRange(item, path);
    if (!chapterIds.has(chapter)) throw new Error(`content/portfolio.yaml: ${path}.chapter must match a career chapter id`);
    return {
      organization: string(item.organization, `${path}.organization`),
      logo: string(item.logo, `${path}.logo`),
      role: string(item.role, `${path}.role`),
      chapter,
      ...dates,
      summary: string(item.summary, `${path}.summary`),
      highlights: array(item.highlights, `${path}.highlights`, string),
    };
  });

  return {
    name: string(sourceProfile.name, "profile.name"),
    headline: string(sourceProfile.headline, "profile.headline"),
    summary: array(sourceProfile.summary, "profile.summary", string),
    careerChapters: chapterDefinitions.map((chapter, index) => ({
      ...chapter,
      meta: careerChapterMeta(
        experience.filter((role) => role.chapter === chapter.id),
        `profile.careerChapters[${String(index)}]`,
      ),
    })),
    facts: array(sourceProfile.facts, "profile.facts", (value, path) => {
      const item = record(value, path);
      return { label: string(item.label, `${path}.label`), value: string(item.value, `${path}.value`) };
    }),
    recommendations: array(sourceProfile.recommendations, "profile.recommendations", (value, path) => {
      const item = record(value, path);
      return {
        author: string(item.author, `${path}.author`),
        position: string(item.position, `${path}.position`),
        quote: string(item.quote, `${path}.quote`),
      };
    }),
    experience,
    education: {
      institution: string(education.institution, "profile.education.institution"),
      qualification: string(education.qualification, "profile.education.qualification"),
      period: monthRange(education, "profile.education").period,
      location: string(education.location, "profile.education.location"),
    },
    certifications: array(sourceProfile.certifications, "profile.certifications", (value, path) => {
      const item = record(value, path);
      return {
        title: string(item.title, `${path}.title`),
        date: formatMonth(calendarMonth(item.date, `${path}.date`)),
        icon: string(item.icon, `${path}.icon`),
        href: string(item.href, `${path}.href`),
      };
    }),
    learning: array(sourceProfile.learning, "profile.learning", (value, path) => {
      const item = record(value, path);
      return {
        title: string(item.title, `${path}.title`),
        provider: string(item.provider, `${path}.provider`),
      };
    }),
    skills: array(sourceProfile.skills, "profile.skills", (value, path) => {
      const item = record(value, path);
      return { title: string(item.title, `${path}.title`), skills: array(item.skills, `${path}.skills`, string) };
    }),
    links: array(sourceProfile.links, "profile.links", link),
  };
}

/**
 * Validates and returns the repository-authored portfolio YAML document.
 *
 * @param value - Parsed but untrusted YAML document.
 * @returns The validated portfolio profile and home content.
 * @throws When any required content field is missing or malformed.
 */
export function validatePortfolio(value: unknown): { profile: PortfolioProfile; home: HomeContent } {
  const root = record(value, "root");
  const sourceProfile = record(root.profile, "profile");
  const sourceHome = record(root.home, "home");
  const mobileNavigation = record(sourceHome.mobileNavigation, "home.mobileNavigation");
  const hero = record(sourceHome.hero, "home.hero");
  const projects = record(sourceHome.projects, "home.projects");
  const codeActivity = record(sourceHome.codeActivity, "home.codeActivity");
  const writing = record(sourceHome.writing, "home.writing");
  const contact = record(sourceHome.contact, "home.contact");
  const availability = record(hero.availability, "home.hero.availability");
  const footer = record(sourceHome.footer, "home.footer");
  const descriptors = array(hero.descriptors, "home.hero.descriptors", string);
  const descriptorInterval = number(hero.descriptorInterval, "home.hero.descriptorInterval");
  if (!descriptors.length) throw new Error("content/portfolio.yaml: home.hero.descriptors must not be empty");
  if (descriptorInterval <= 0) throw new Error("content/portfolio.yaml: home.hero.descriptorInterval must be positive");
  return {
    profile: parseProfile(sourceProfile),
    home: {
      metadataDescription: string(sourceHome.metadataDescription, "home.metadataDescription"),
      mobileNavigation: {
        scrollThreshold: number(mobileNavigation.scrollThreshold, "home.mobileNavigation.scrollThreshold"),
      },
      hero: {
        availability: {
          status: string(availability.status, "home.hero.availability.status"),
          qualifier: string(availability.qualifier, "home.hero.availability.qualifier"),
        },
        title: string(hero.title, "home.hero.title"),
        lead: string(hero.lead, "home.hero.lead"),
        descriptors,
        descriptorInterval,
        resumeHref: string(hero.resumeHref, "home.hero.resumeHref"),
      },
      projects: {
        featuredSlugs: array(projects.featuredSlugs, "home.projects.featuredSlugs", string),
        indexDescription: string(projects.indexDescription, "home.projects.indexDescription"),
      },
      codeActivity: {
        username: string(codeActivity.username, "home.codeActivity.username"),
      },
      writing: {
        indexDescription: string(writing.indexDescription, "home.writing.indexDescription"),
      },
      contact: {
        description: string(contact.description, "home.contact.description"),
        email: string(contact.email, "home.contact.email"),
      },
      footer: {
        locale: string(footer.locale, "home.footer.locale"),
        timeZone: string(footer.timeZone, "home.footer.timeZone"),
      },
    },
  };
}

const content = validatePortfolio(load(readFileSync(join(process.cwd(), "content", "portfolio.yaml"), "utf8")));

export const { profile, home } = content;
