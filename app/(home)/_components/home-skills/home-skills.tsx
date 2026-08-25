import {
  ApacheKafka,
  Argocd,
  Aws,
  AzureAiStudio,
  AzureAzureDevops,
  ClaudeAi,
  ClaudeCode,
  Codex,
  Coderabbit,
  Cursor,
  Docker,
  Elasticsearch,
  GithubActions,
  GithubCopilot,
  Gitlab,
  Grafana,
  GcpApi,
  Jenkins,
  Kibana,
  Kubernetes,
  Langfuse,
  Microsoft,
  MicrosoftSqlServer,
  Mongodb,
  Opencode,
  Pi,
  Postgresql,
  Postman,
  Prometheus,
  Python,
  Typescript,
  Vercel,
} from "@thesvg/react";
import { Database, Gauge, Sparkles, TextSearch, type LucideIcon } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { home, profile } from "@/content/structured";
import { clsx } from "clsx";
import styles from "./home-skills.module.scss";

const semanticIconProps = { absoluteStrokeWidth: true, size: 20, strokeWidth: 2 } as const;

/**
 * Renders a Lucide mark with the shared two-tone semantic gradient.
 *
 * @param Icon - Lucide icon component.
 * @param tone - Route-local semantic color class.
 * @returns A layered gradient icon.
 */
function SemanticGradientIcon({ icon: Icon, tone }: { icon: LucideIcon; tone: string | undefined }) {
  return (
    <span className={clsx(styles.semanticGradientIcon, tone)} data-icon-kind="semantic-gradient">
      <Icon {...semanticIconProps} />
      <Icon {...semanticIconProps} />
    </span>
  );
}

const skillIcons: Readonly<Record<string, ReactNode>> = {
  "Microsoft Agent Framework": (
    <Image
      alt=""
      className={clsx(styles.brandIcon, styles.colorBrandIcon)}
      data-icon-kind="microsoft-agent-framework"
      height={20}
      src="/skills/microsoft-agent-framework.svg"
      width={20}
    />
  ),
  "Semantic Kernel": <SemanticGradientIcon icon={Sparkles} tone={styles.orchestration} />,
  "Microsoft.Extensions.AI": <Microsoft className={clsx(styles.brandIcon, styles.colorBrandIcon)} />,
  "LLM Evaluation": <SemanticGradientIcon icon={Gauge} tone={styles.evaluation} />,
  "RAG Systems": <SemanticGradientIcon icon={TextSearch} tone={styles.retrieval} />,
  "Azure AI Foundry": <AzureAiStudio className={clsx(styles.brandIcon, styles.colorBrandIcon)} />,
  Langfuse: <Langfuse className={clsx(styles.brandIcon, styles.colorBrandIcon)} variant="color" />,
  "C#": <span className={styles.dotnetBadge} data-icon-kind="dotnet">C#</span>,
  Python: <Python className={clsx(styles.brandIcon, styles.colorBrandIcon)} />,
  TypeScript: <Typescript className={clsx(styles.brandIcon, styles.colorBrandIcon)} />,
  ".NET": <span className={styles.dotnetBadge} data-icon-kind="dotnet">.NET</span>,
  "ASP.NET Web API": <span className={styles.dotnetBadge} data-icon-kind="dotnet">ASP</span>,
  "Entity Framework": <span className={styles.dotnetBadge} data-icon-kind="dotnet">EF</span>,
  "REST API": <GcpApi className={clsx(styles.brandIcon, styles.colorBrandIcon)} data-icon-kind="gcp-api" />,
  Postman: <Postman className={clsx(styles.brandIcon, styles.colorBrandIcon)} />,
  SQL: <SemanticGradientIcon icon={Database} tone={styles.retrieval} />,
  "Microsoft SQL Server": <MicrosoftSqlServer className={clsx(styles.brandIcon, styles.colorBrandIcon)} />,
  PostgreSQL: <Postgresql className={clsx(styles.brandIcon, styles.colorBrandIcon)} />,
  MongoDB: <Mongodb className={clsx(styles.brandIcon, styles.colorBrandIcon)} />,
  Elasticsearch: <Elasticsearch className={clsx(styles.brandIcon, styles.monoBrandIcon, styles.elasticsearch)} variant="mono" />,
  Kafka: <ApacheKafka className={clsx(styles.brandIcon, styles.monoBrandIcon, styles.kafka)} variant="mono" />,
  "Microsoft Azure": (
    <svg aria-hidden="true" className={clsx(styles.brandIcon, styles.azureIcon)} viewBox="0 0 24 24">
      <path d="M22.379 23.343a1.62 1.62 0 0 0 1.536-2.14v.002L17.35 1.76A1.62 1.62 0 0 0 15.816.657H8.184A1.62 1.62 0 0 0 6.65 1.76L.086 21.204a1.62 1.62 0 0 0 1.536 2.139h4.741a1.62 1.62 0 0 0 1.535-1.103l.977-2.892 4.947 3.675c.28.208.618.32.966.32m-3.084-12.531 3.624 10.739a.54.54 0 0 1-.51.713v-.001h-.03a.54.54 0 0 1-.322-.106l-9.287-6.9h4.853m6.313 7.006c.116-.326.13-.694.007-1.058L9.79 1.76a1.722 1.722 0 0 0-.007-.02h6.034a.54.54 0 0 1 .512.366l6.562 19.445a.54.54 0 0 1-.338.684" />
    </svg>
  ),
  "Amazon Web Services": <Aws className={clsx(styles.brandIcon, styles.monoBrandIcon, styles.aws)} variant="color" />,
  Vercel: <Vercel className={clsx(styles.brandIcon, styles.monoBrandIcon, styles.vercel)} variant="mono" />,
  Docker: <Docker className={clsx(styles.brandIcon, styles.monoBrandIcon, styles.docker)} variant="mono" />,
  Kubernetes: <Kubernetes className={clsx(styles.brandIcon, styles.monoBrandIcon, styles.kubernetes)} variant="mono" />,
  "Argo CD": <Argocd className={clsx(styles.brandIcon, styles.monoBrandIcon, styles.argoCd)} variant="mono" />,
  Jenkins: <Jenkins className={clsx(styles.brandIcon, styles.monoBrandIcon, styles.jenkins)} variant="mono" />,
  Grafana: <Grafana className={clsx(styles.brandIcon, styles.monoBrandIcon, styles.grafana)} variant="mono" />,
  Prometheus: <Prometheus className={clsx(styles.brandIcon, styles.monoBrandIcon, styles.prometheus)} variant="mono" />,
  Kibana: <Kibana className={clsx(styles.brandIcon, styles.monoBrandIcon, styles.kibana)} variant="mono" />,
  "Azure DevOps": <AzureAzureDevops className={clsx(styles.brandIcon, styles.colorBrandIcon)} />,
  "GitHub Actions": <GithubActions className={clsx(styles.brandIcon, styles.monoBrandIcon, styles.githubActions)} variant="mono" />,
  "GitLab CI/CD": <Gitlab className={clsx(styles.brandIcon, styles.monoBrandIcon, styles.gitlab)} variant="mono" />,
  "Claude Code": <ClaudeCode className={clsx(styles.brandIcon, styles.colorBrandIcon)} data-icon-kind="claude-code" variant="color" />,
  "Claude Design": <ClaudeAi className={clsx(styles.brandIcon, styles.colorBrandIcon)} data-icon-kind="claude-design" />,
  Codex: <Codex className={clsx(styles.brandIcon, styles.colorBrandIcon, styles.codexIcon)} data-icon-kind="codex" />,
  Pi: <Pi className={clsx(styles.brandIcon, styles.monoBrandIcon, styles.pi)} />,
  OpenCode: <Opencode className={clsx(styles.brandIcon, styles.monoBrandIcon, styles.opencode)} variant="mono" />,
  Cursor: <Cursor className={clsx(styles.brandIcon, styles.monoBrandIcon, styles.cursor)} variant="mono" />,
  CodeRabbit: <Coderabbit className={clsx(styles.brandIcon, styles.monoBrandIcon, styles.codeRabbit)} variant="mono" />,
  "GitHub Copilot": <GithubCopilot className={clsx(styles.brandIcon, styles.monoBrandIcon, styles.githubCopilot)} variant="mono" />,
};

/**
 * Renders validated skill groups as centered semantic lists.
 *
 * @returns The Home Skills section.
 */
export function HomeSkills() {
  return (
    <section id="skills" aria-labelledby="skills-heading" className={clsx(styles.skills, "page-shell-gutter w-full")}>
      <svg aria-hidden="true" className="absolute size-0 overflow-hidden">
        <defs>
          <linearGradient id="codex-icon-gradient" x1="0" x2="1" y1="0" y2="1">
            <stop stopColor="#b18cff" />
            <stop offset="0.5" stopColor="#6da8ff" />
            <stop offset="1" stopColor="#4b52e8" />
          </linearGradient>
        </defs>
      </svg>
      <h2
        id="skills-heading"
        className={clsx(styles.sectionLabel, "border-t font-mono font-normal uppercase text-muted-foreground")}
      >
        {home.skills.label}
      </h2>
      <div>
        {profile.skills.map((group) => (
          <section className={styles.skillGroup} data-slot="skill-group" key={group.title}>
            <h3 className={clsx(styles.groupLabel, "font-mono font-normal uppercase text-muted-foreground")}>
              {group.title}
            </h3>
            <ul className="m-0 mt-4.5 flex list-none flex-wrap justify-center gap-x-5.5 gap-y-3.5 p-0 md:gap-x-8 lg:mt-6.5 lg:gap-x-10 lg:gap-y-4.5">
              {group.skills.map((skill) => (
                <li
                  className="inline-flex items-center gap-2 text-sm leading-snug lg:gap-2.5 lg:text-base"
                  data-slot="skill"
                  key={skill}
                >
                  <span
                    aria-hidden="true"
                    className="grid size-5 shrink-0 place-items-center"
                    data-slot="skill-icon"
                  >
                    {skillIcons[skill]}
                  </span>
                  <span data-slot="skill-label">{skill}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}
