import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load } from "js-yaml";

import { validatePortfolio } from "./portfolio";

export type {
  CareerChapter,
  Education,
  Experience,
  ExternalLink,
  HomeContent,
  PortfolioProfile,
  Recommendation,
  SkillGroup,
} from "./portfolio";
export { validatePortfolio } from "./portfolio";

const content = validatePortfolio(load(readFileSync(join(process.cwd(), "content", "portfolio.yaml"), "utf8")));

/** Validated profile and Home records loaded from repository-authored YAML. */
export const { profile, home } = content;
