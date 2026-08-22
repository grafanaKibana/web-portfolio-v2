import Link from "next/link";
import { Download } from "lucide-react";

import { ContactForm } from "@/app/_components/contact-form";
import { DescriptorRotation } from "@/app/_components/descriptor-rotation";
import { loadActivitySnapshot } from "@/content/activity";
import { loadArticles } from "@/content/articles/server";
import { loadProjects } from "@/content/projects/server";
import { profile } from "@/content/structured";

const sectionClass = "border-t py-14 sm:py-20";
const headingClass = "mb-8 text-2xl font-medium tracking-tight";
const activityMonth = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" });

/**
 * Loads server-owned portfolio content and renders the home page.
 *
 * @returns The complete portfolio home page.
 */
export default async function Home() {
  const [activity, articles, projects] = await Promise.all([loadActivitySnapshot(), loadArticles(), loadProjects()]);

  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-6">
      <section className="py-20 sm:py-28" aria-labelledby="intro-heading">
        <p className="mb-4 h-5 overflow-hidden font-mono text-sm text-primary-text">
          <DescriptorRotation />
        </p>
        <h1 id="intro-heading" className="max-w-3xl text-4xl font-medium tracking-tight sm:text-6xl">
          Hi, I’m {profile.name}.
        </h1>
        <p className="mt-6 max-w-2xl text-xl leading-8 text-muted-foreground">{profile.headline}.</p>
        <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3">
          <a className="inline-flex items-center gap-2 font-medium underline underline-offset-4" href="/nikita-reshetnik-cv.pdf">
            <Download aria-hidden="true" className="size-4" /> Résumé
          </a>
          {profile.links.map((link) => <a key={link.href} className="font-medium underline underline-offset-4" href={link.href}>{link.label}</a>)}
        </div>
      </section>

      <section id="about" className={sectionClass} aria-labelledby="about-heading">
        <h2 id="about-heading" className={headingClass}>About</h2>
        <div className="max-w-3xl space-y-5 text-lg leading-8 text-muted-foreground">
          {profile.summary.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </div>
        <dl className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {profile.facts.map((fact) => <div key={fact.label}><dt className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{fact.label}</dt><dd className="mt-2 font-medium">{fact.value}</dd></div>)}
        </dl>
      </section>

      <section id="experience" className={sectionClass} aria-labelledby="experience-heading">
        <h2 id="experience-heading" className={headingClass}>Experience</h2>
        <ol className="space-y-10">
          {profile.experience.map((experience) => (
            <li key={`${experience.organization}-${experience.role}-${experience.period}`} className="grid gap-3 sm:grid-cols-[12rem_1fr]">
              <p className="font-mono text-sm text-muted-foreground">{experience.period}</p>
              <div>
                <h3 className="text-lg font-semibold">{experience.role}</h3>
                <p className="mt-1 font-medium text-muted-foreground">{experience.organization}</p>
                <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">{experience.summary}</p>
                {experience.highlights.length > 0 && (
                  <details open className="mt-4">
                    <summary className="cursor-pointer font-mono text-xs uppercase tracking-wider text-muted-foreground">
                      Details
                    </summary>
                    <ul className="mt-4 list-disc space-y-2 pl-5 text-muted-foreground">
                      {experience.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}
                    </ul>
                  </details>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section id="education" className={sectionClass} aria-labelledby="education-heading">
        <h2 id="education-heading" className={headingClass}>Education</h2>
        <p className="font-mono text-sm text-muted-foreground">{profile.education.period}</p>
        <h3 className="mt-3 text-lg font-semibold">{profile.education.qualification}</h3>
        <p className="mt-1 text-muted-foreground">{profile.education.institution}</p>
        <h3 className="mt-10 font-medium">Industry certifications</h3>
        <ul className="mt-4 space-y-3">{profile.certifications.map((certification) => <li key={certification.label}>{certification.href ? <a className="underline underline-offset-4" href={certification.href}>{certification.label}</a> : certification.label}</li>)}</ul>
      </section>

      <section id="skills" className={sectionClass} aria-labelledby="skills-heading">
        <h2 id="skills-heading" className={headingClass}>Skills</h2>
        <div className="grid gap-8 md:grid-cols-3">
          {profile.skills.map((group) => <div key={group.title}><h3 className="font-medium">{group.title}</h3><ul className="mt-4 flex flex-wrap gap-2 text-sm text-muted-foreground">{group.skills.map((skill) => <li key={skill} className="rounded-full border px-3 py-1">{skill}</li>)}</ul></div>)}
        </div>
      </section>

      <section id="projects" className={sectionClass} aria-labelledby="projects-heading">
        <div className="mb-8 flex items-baseline justify-between gap-4"><h2 id="projects-heading" className="text-2xl font-medium tracking-tight">Selected work</h2><Link className="text-sm underline underline-offset-4" href="/projects">All projects</Link></div>
        <ul className="space-y-8">{projects.map((project) => <li key={project.slug}><h3 className="text-xl font-medium"><Link className="underline-offset-4 hover:underline" href={`/projects/${project.slug}`}>{project.metadata.title}</Link></h3><p className="mt-3 max-w-3xl leading-7 text-muted-foreground">{project.metadata.description}</p></li>)}</ul>
      </section>

      <section id="code" className={sectionClass} aria-labelledby="code-heading">
        <h2 id="code-heading" className={headingClass}>Code activity</h2>
        <p className="max-w-2xl leading-7 text-muted-foreground">Open-source work includes merged contributions to Microsoft.Extensions.AI.Evaluation reporting and Obsidian Digital Garden publishing.</p>
        <a className="mt-5 inline-block font-medium underline underline-offset-4" href="https://github.com/grafanaKibana">github.com/grafanaKibana</a>
        {activity.available && (
          <figure className="mt-10 border-t pt-6">
            <figcaption className="font-mono text-xs uppercase tracking-wider text-muted-foreground">GitHub activity · last 12 months</figcaption>
            <div className="mt-6 grid h-24 grid-cols-12 items-end gap-2" aria-hidden="true">
              {activity.months.map((month) => <span key={month.period} className="bg-primary/30" style={{ height: `${month.value * 100}%` }} />)}
            </div>
            <ol className="mt-3 grid grid-cols-12 gap-2 text-center font-mono text-[10px] text-muted-foreground">
              {activity.months.map((month) => <li key={month.period}><span aria-hidden="true">{activityMonth.format(new Date(`${month.period}-01T00:00:00Z`))}</span><span className="sr-only">{month.period}: {Math.round(month.value * 100)}% relative activity</span></li>)}
            </ol>
          </figure>
        )}
      </section>

      <section id="writing" className={sectionClass} aria-labelledby="writing-heading">
        <div className="mb-8 flex items-baseline justify-between gap-4"><h2 id="writing-heading" className="text-2xl font-medium tracking-tight">Writing</h2><Link className="text-sm underline underline-offset-4" href="/articles">All writing</Link></div>
        <ul className="space-y-8">{articles.map((article) => <li key={article.slug}><time className="font-mono text-sm text-muted-foreground" dateTime={article.metadata.published}>{article.metadata.published}</time><h3 className="mt-2 text-xl font-medium"><Link className="underline-offset-4 hover:underline" href={`/articles/${article.slug}`}>{article.metadata.title}</Link></h3><p className="mt-3 max-w-3xl leading-7 text-muted-foreground">{article.metadata.description}</p></li>)}</ul>
      </section>

      <section id="contact" className={sectionClass} aria-labelledby="contact-heading">
        <h2 id="contact-heading" className={headingClass}>Contact</h2>
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-20">
          <div>
            <p className="max-w-2xl text-lg leading-8 text-muted-foreground">Have a role, project, or engineering challenge worth discussing? Send me a message or email me directly.</p>
            <a className="mt-6 inline-block text-lg font-medium underline underline-offset-4" href="mailto:reshetnik.nikita@gmail.com">reshetnik.nikita@gmail.com</a>
          </div>
          <ContactForm />
        </div>
      </section>
    </main>
  );
}
