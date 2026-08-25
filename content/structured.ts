import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load } from "js-yaml";

export interface ExternalLink {
  label: string;
  href: string;
}

export interface Experience {
  organization: string;
  logo: string;
  role: string;
  period: string;
  summary: string;
  highlights: readonly string[];
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

export interface PortfolioProfile {
  name: string;
  headline: string;
  summary: readonly string[];
  careerChapters: readonly { meta: string; title: string; summary: string }[];
  facts: readonly { label: string; value: string }[];
  experience: readonly Experience[];
  education: Education;
  certifications: readonly { title: string; date: string; icon: string; href: string }[];
  learning: readonly { title: string; provider: string }[];
  skills: readonly SkillGroup[];
  links: readonly ExternalLink[];
}

export interface HomeContent {
  metadataDescription: string;
  accessibility: {
    skipToContent: string;
    backToTop: string;
    primaryNavigation: string;
    mobileNavigation: string;
    compactNavigation: string;
  };
  theme: {
    change: string;
    switchToDark: string;
    switchToLight: string;
  };
  navigation: readonly ExternalLink[];
  mobileNavigation: {
    closeLabel: string;
    triggerLabel: string;
    defaultSectionLabel: string;
    scrollThreshold: number;
  };
  hero: {
    availability: { status: string; qualifier: string };
    title: string;
    lead: string;
    descriptors: readonly string[];
    descriptorInterval: number;
    actions: readonly (ExternalLink & { icon: string })[];
    socialLinks: readonly (ExternalLink & { icon: string })[];
  };
  experience: {
    label: string;
    detailsLabel: string;
  };
  education: {
    label: string;
    degreeLabel: string;
    certificationsLabel: string;
  };
  footer: {
    rights: string;
    localTimeLabel: string;
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
 * Parses a labeled icon hyperlink from YAML.
 *
 * @param value - Untrusted YAML link value.
 * @param path - Human-readable field path.
 * @returns The validated labeled icon link.
 * @throws When the link shape is invalid.
 */
function iconLink(value: unknown, path: string) {
  const item = record(value, path);
  return { ...link(item, path), icon: string(item.icon, `${path}.icon`) };
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

  return {
    name: string(sourceProfile.name, "profile.name"),
    headline: string(sourceProfile.headline, "profile.headline"),
    summary: array(sourceProfile.summary, "profile.summary", string),
    careerChapters: array(sourceProfile.careerChapters, "profile.careerChapters", (value, path) => {
      const item = record(value, path);
      return {
        meta: string(item.meta, `${path}.meta`),
        title: string(item.title, `${path}.title`),
        summary: string(item.summary, `${path}.summary`),
      };
    }),
    facts: array(sourceProfile.facts, "profile.facts", (value, path) => {
      const item = record(value, path);
      return { label: string(item.label, `${path}.label`), value: string(item.value, `${path}.value`) };
    }),
    experience: array(sourceProfile.experience, "profile.experience", (value, path) => {
      const item = record(value, path);
      return {
        organization: string(item.organization, `${path}.organization`),
        logo: string(item.logo, `${path}.logo`),
        role: string(item.role, `${path}.role`),
        period: string(item.period, `${path}.period`),
        summary: string(item.summary, `${path}.summary`),
        highlights: array(item.highlights, `${path}.highlights`, string),
      };
    }),
    education: {
      institution: string(education.institution, "profile.education.institution"),
      qualification: string(education.qualification, "profile.education.qualification"),
      period: string(education.period, "profile.education.period"),
      location: string(education.location, "profile.education.location"),
    },
    certifications: array(sourceProfile.certifications, "profile.certifications", (value, path) => {
      const item = record(value, path);
      return {
        title: string(item.title, `${path}.title`),
        date: string(item.date, `${path}.date`),
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
function validatePortfolio(value: unknown): { profile: PortfolioProfile; home: HomeContent } {
  const root = record(value, "root");
  const sourceProfile = record(root.profile, "profile");
  const sourceHome = record(root.home, "home");
  const accessibility = record(sourceHome.accessibility, "home.accessibility");
  const theme = record(sourceHome.theme, "home.theme");
  const mobileNavigation = record(sourceHome.mobileNavigation, "home.mobileNavigation");
  const hero = record(sourceHome.hero, "home.hero");
  const experience = record(sourceHome.experience, "home.experience");
  const education = record(sourceHome.education, "home.education");
  const availability = record(hero.availability, "home.hero.availability");
  const footer = record(sourceHome.footer, "home.footer");
  const navigation = array(sourceHome.navigation, "home.navigation", link);
  const descriptors = array(hero.descriptors, "home.hero.descriptors", string);
  const actions = array(hero.actions, "home.hero.actions", iconLink);
  const socialLinks = array(hero.socialLinks, "home.hero.socialLinks", iconLink);
  const descriptorInterval = number(hero.descriptorInterval, "home.hero.descriptorInterval");
  if (!descriptors.length) throw new Error("content/portfolio.yaml: home.hero.descriptors must not be empty");
  if (actions.length !== 2) throw new Error("content/portfolio.yaml: home.hero.actions must contain two actions");
  if (descriptorInterval <= 0) throw new Error("content/portfolio.yaml: home.hero.descriptorInterval must be positive");

  return {
    profile: parseProfile(sourceProfile),
    home: {
      metadataDescription: string(sourceHome.metadataDescription, "home.metadataDescription"),
      accessibility: {
        skipToContent: string(accessibility.skipToContent, "home.accessibility.skipToContent"),
        backToTop: string(accessibility.backToTop, "home.accessibility.backToTop"),
        primaryNavigation: string(accessibility.primaryNavigation, "home.accessibility.primaryNavigation"),
        mobileNavigation: string(accessibility.mobileNavigation, "home.accessibility.mobileNavigation"),
        compactNavigation: string(accessibility.compactNavigation, "home.accessibility.compactNavigation"),
      },
      theme: {
        change: string(theme.change, "home.theme.change"),
        switchToDark: string(theme.switchToDark, "home.theme.switchToDark"),
        switchToLight: string(theme.switchToLight, "home.theme.switchToLight"),
      },
      navigation,
      mobileNavigation: {
        closeLabel: string(mobileNavigation.closeLabel, "home.mobileNavigation.closeLabel"),
        triggerLabel: string(mobileNavigation.triggerLabel, "home.mobileNavigation.triggerLabel"),
        defaultSectionLabel: string(mobileNavigation.defaultSectionLabel, "home.mobileNavigation.defaultSectionLabel"),
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
        actions,
        socialLinks,
      },
      experience: {
        label: string(experience.label, "home.experience.label"),
        detailsLabel: string(experience.detailsLabel, "home.experience.detailsLabel"),
      },
      education: {
        label: string(education.label, "home.education.label"),
        degreeLabel: string(education.degreeLabel, "home.education.degreeLabel"),
        certificationsLabel: string(education.certificationsLabel, "home.education.certificationsLabel"),
      },
      footer: {
        rights: string(footer.rights, "home.footer.rights"),
        localTimeLabel: string(footer.localTimeLabel, "home.footer.localTimeLabel"),
        locale: string(footer.locale, "home.footer.locale"),
        timeZone: string(footer.timeZone, "home.footer.timeZone"),
      },
    },
  };
}

const content = validatePortfolio(load(readFileSync(join(process.cwd(), "content", "portfolio.yaml"), "utf8")));

export const { profile, home } = content;
