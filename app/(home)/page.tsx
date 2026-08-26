import { HomeAbout } from "./_components/home-about/home-about";
import { HomeCodeActivity } from "./_components/home-code-activity/home-code-activity";
import { HomeContact } from "./_components/contact-form/home-contact";
import { HomeEducation } from "./_components/home-education/home-education";
import { HomeExperience } from "./_components/home-experience/home-experience";
import { HomeHero } from "./_components/home-hero/home-hero";
import { HomeProjects } from "./_components/home-projects/home-projects";
import { HomeSkills } from "./_components/home-skills/home-skills";
import { HomeWriting } from "./_components/home-writing/home-writing";

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
