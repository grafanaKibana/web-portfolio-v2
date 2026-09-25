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
import { BrainCircuit, Database, Gauge, Sparkles, TextSearch, type LucideIcon } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { Subheading } from "../subheading";
import { profile } from "@/lib/content/portfolio/server";
import { clsx } from "clsx";
import { SkillList } from "./skill-list";
import styles from "./skills.module.scss";

const semanticIconProps = { absoluteStrokeWidth: true, size: 20, strokeWidth: 2 } as const;
const brandIconClass = "size-5";
const dotnetBadgeClass = "grid size-5 place-items-center rounded-xs text-[0.4375rem] leading-none font-bold text-white";

/**
 * Renders a Lucide mark with the shared two-tone semantic gradient.
 *
 * @param Icon - Lucide icon component.
 * @param tone - Route-local semantic color class.
 * @returns A layered gradient icon.
 */
function SemanticGradientIcon({ icon: Icon, tone }: { icon: LucideIcon; tone: string | undefined }) {
  return (
    <span className={clsx(styles.semanticGradientIcon, "grid size-5", tone)} data-icon-kind="semantic-gradient">
      <Icon {...semanticIconProps} />
      <Icon {...semanticIconProps} />
    </span>
  );
}

const skillIcons: Readonly<Record<string, ReactNode>> = {
  "Microsoft Agent Framework": (<Image alt="" className={clsx(brandIconClass, styles.colorBrandIcon)} data-icon-kind="microsoft-agent-framework" height={20} src="/skills/microsoft-agent-framework.svg" width={20}/>),
  "Semantic Kernel": <SemanticGradientIcon icon={Sparkles} tone={styles.orchestration} />,
  "Microsoft.Extensions.AI": <Microsoft className={clsx(brandIconClass, styles.colorBrandIcon)} />,
  "Large Language Models": <SemanticGradientIcon icon={BrainCircuit} tone={styles.orchestration} />,
  "LLM Evaluation": <SemanticGradientIcon icon={Gauge} tone={styles.evaluation} />,
  "Retrieval-Augmented Generation": <SemanticGradientIcon icon={TextSearch} tone={styles.retrieval} />,
  "Azure AI Foundry": <AzureAiStudio className={clsx(brandIconClass, styles.colorBrandIcon)} />,
  Langfuse: <Langfuse className={clsx(brandIconClass, styles.colorBrandIcon)} variant="color" />,
  "C#": <span className={clsx(styles.dotnetBadge, dotnetBadgeClass)} data-icon-kind="dotnet">C#</span>,
  Python: <Python className={clsx(brandIconClass, styles.colorBrandIcon)} />,
  TypeScript: <Typescript className={clsx(brandIconClass, styles.colorBrandIcon)} />,
  ".NET": <span className={clsx(styles.dotnetBadge, dotnetBadgeClass)} data-icon-kind="dotnet">.NET</span>,
  "ASP.NET Web API": <span className={clsx(styles.dotnetBadge, dotnetBadgeClass)} data-icon-kind="dotnet">ASP</span>,
  "Entity Framework": <span className={clsx(styles.dotnetBadge, dotnetBadgeClass)} data-icon-kind="dotnet">EF</span>,
  "REST API": <GcpApi className={clsx(brandIconClass, styles.colorBrandIcon)} data-icon-kind="gcp-api" />,
  Postman: <Postman className={clsx(brandIconClass, styles.colorBrandIcon)} />,
  SQL: <SemanticGradientIcon icon={Database} tone={styles.retrieval} />,
  "Microsoft SQL Server": <MicrosoftSqlServer className={clsx(brandIconClass, styles.colorBrandIcon)} />,
  PostgreSQL: <Postgresql className={clsx(brandIconClass, styles.colorBrandIcon)} />,
  MongoDB: <Mongodb className={clsx(brandIconClass, styles.colorBrandIcon)} />,
  Elasticsearch: <Elasticsearch className={clsx(brandIconClass, styles.monoBrandIcon, styles.elasticsearch)} variant="mono" />,
  Kafka: <ApacheKafka className={clsx(brandIconClass, styles.monoBrandIcon, styles.kafka)} variant="mono" />,
  "Microsoft Azure": (
    <svg aria-hidden="true" className={clsx(brandIconClass, styles.azureIcon)} viewBox="0 0 24 24">
      <path d="M22.379 23.343a1.62 1.62 0 0 0 1.536-2.14v.002L17.35 1.76A1.62 1.62 0 0 0 15.816.657H8.184A1.62 1.62 0 0 0 6.65 1.76L.086 21.204a1.62 1.62 0 0 0 1.536 2.139h4.741a1.62 1.62 0 0 0 1.535-1.103l.977-2.892 4.947 3.675c.28.208.618.32.966.32m-3.084-12.531 3.624 10.739a.54.54 0 0 1-.51.713v-.001h-.03a.54.54 0 0 1-.322-.106l-9.287-6.9h4.853m6.313 7.006c.116-.326.13-.694.007-1.058L9.79 1.76a1.722 1.722 0 0 0-.007-.02h6.034a.54.54 0 0 1 .512.366l6.562 19.445a.54.54 0 0 1-.338.684" />
    </svg>
  ),
  "Amazon Web Services": <Aws className={clsx(brandIconClass, styles.monoBrandIcon, styles.aws)} variant="color" />,
  Vercel: <Vercel className={clsx(brandIconClass, styles.monoBrandIcon, styles.vercel)} variant="mono" />,
  Docker: <Docker className={clsx(brandIconClass, styles.monoBrandIcon, styles.docker)} variant="mono" />,
  Kubernetes: <Kubernetes className={clsx(brandIconClass, styles.monoBrandIcon, styles.kubernetes)} variant="mono" />,
  "Argo CD": <Argocd className={clsx(brandIconClass, styles.monoBrandIcon, styles.argoCd)} variant="mono" />,
  Jenkins: <Jenkins className={clsx(brandIconClass, styles.monoBrandIcon, styles.jenkins)} variant="mono" />,
  Grafana: <Grafana className={clsx(brandIconClass, styles.monoBrandIcon, styles.grafana)} variant="mono" />,
  Prometheus: <Prometheus className={clsx(brandIconClass, styles.monoBrandIcon, styles.prometheus)} variant="mono" />,
  Kibana: <Kibana className={clsx(brandIconClass, styles.monoBrandIcon, styles.kibana)} variant="mono" />,
  "Azure DevOps": <AzureAzureDevops className={clsx(brandIconClass, styles.colorBrandIcon)} />,
  "GitHub Actions": <GithubActions className={clsx(brandIconClass, styles.monoBrandIcon, styles.githubActions)} variant="mono" />,
  "GitLab CI/CD": <Gitlab className={clsx(brandIconClass, styles.monoBrandIcon, styles.gitlab)} variant="mono" />,
  "Claude Code": <ClaudeCode className={clsx(brandIconClass, styles.colorBrandIcon)} data-icon-kind="claude-code" variant="color" />,
  "Claude Design": <ClaudeAi className={clsx(brandIconClass, styles.colorBrandIcon)} data-icon-kind="claude-design" />,
  Codex: <Codex className={clsx(brandIconClass, styles.colorBrandIcon, styles.codexIcon)} data-icon-kind="codex" />,
  Pi: <Pi className={clsx(brandIconClass, styles.monoBrandIcon, styles.pi)} />,
  OpenCode: <Opencode className={clsx(brandIconClass, styles.monoBrandIcon, styles.opencode)} variant="mono" />,
  Cursor: <Cursor className={clsx(brandIconClass, styles.monoBrandIcon, styles.cursor)} variant="mono" />,
  CodeRabbit: <Coderabbit className={clsx(brandIconClass, styles.monoBrandIcon, styles.codeRabbit)} variant="mono" />,
  "GitHub Copilot": <GithubCopilot className={clsx(brandIconClass, styles.monoBrandIcon, styles.githubCopilot)} variant="mono" />,
};

/**
 * Renders validated skill groups as centered semantic lists.
 *
 * @returns The Home Skills section.
 */
export function HomeSkills() {
  return (
    <section
      id="skills"
      aria-labelledby="skills-heading"
      className="page-shell-gutter w-full scroll-mt-3 py-8 lg:-scroll-mt-5 lg:py-12 xl:-scroll-mt-1"
      data-page-motion-section
    >
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
        data-page-motion-row
        data-page-motion-trigger
        id="skills-heading"
        className="m-0 mb-8 border-t pt-3 font-mono text-xs leading-4.5 font-semibold tracking-[0.08em] uppercase text-muted-foreground lg:mb-10 lg:pt-3.5"
      >
        Skills
      </h2>
      <div className="flex flex-col">
        {profile.skills.map((group) => (
          <section
            data-page-motion-cascade="0.062"
            data-page-motion-duration="0.34"
            data-page-motion-row
            data-page-motion-stagger="0.082"
            data-slot="skill-group"
            key={group.title}
          >
            <Subheading align="center" className={styles.groupLabel} data-page-motion-lead>{group.title}</Subheading>
            <SkillList
              className={clsx(
                styles.skillList,
                "mx-0 my-4 flex list-none flex-wrap justify-center gap-x-6 gap-y-4 p-0 md:gap-x-8 lg:my-6 lg:gap-x-10",
              )}
              data-page-motion-item
              skills={group.skills.map((skill) => ({ name: skill, icon: skillIcons[skill] }))}
            />
          </section>
        ))}
      </div>
    </section>
  );
}
