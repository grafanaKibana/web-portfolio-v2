import { HomeAbout } from "./_components/home-about/home-about";
import { HomeEducation } from "./_components/home-education/home-education";
import { HomeExperience } from "./_components/home-experience/home-experience";
import { HomeHero } from "./_components/home-hero/home-hero";

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
    </main>
  );
}
