import { HomeAbout } from "@/app/(home)/_components/about/about";
import { HomeCodeActivity } from "@/app/(home)/_components/code-activity/code-activity";
import { HomeContact } from "@/app/(home)/_components/contact/contact";
import { HomeEducation } from "@/app/(home)/_components/education/education";
import { HomeExperience } from "@/app/(home)/_components/experience/experience";
import { HomeHero } from "@/app/(home)/_components/hero/hero";
import { HomeProjects } from "@/app/(home)/_components/projects/projects";
import { HomeSkills } from "@/app/(home)/_components/skills/skills";
import { HomeWriting } from "@/app/(home)/_components/writing/writing";

/** Refresh interval for server-rendered Home content, in seconds. */
export const revalidate = 300;

/**
 * Composes the ordered sections of the portfolio Home route.
 *
 * @returns The portfolio Home page.
 */
export default function Home() {
  return (
    <main id="main" tabIndex={-1} className="flex flex-1 flex-col focus:outline-none">
      <HomeHero />
      <HomeAbout />
      <HomeExperience />
      <HomeEducation />
      <HomeSkills />
      <HomeProjects />
      <HomeCodeActivity />
      <HomeWriting />
      <HomeContact />
    </main>
  );
}
