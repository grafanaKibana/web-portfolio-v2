import { profile } from "@/lib/content/portfolio/server";
import { EducationContent } from "./education-content";

/** Renders the validated Education section on Home.
 * @returns The Education section with available credentials.
 */
export function HomeEducation() {
  return <EducationContent education={profile.education} certifications={profile.certifications} />;
}
