export interface ExternalLink {
  label: string;
  href: string;
}

export interface Experience {
  organization: string;
  role: string;
  period: string;
  summary: string;
  highlights: readonly string[];
}

export interface Education {
  institution: string;
  qualification: string;
  period: string;
}

export interface SkillGroup {
  title: string;
  skills: readonly string[];
}

export interface PortfolioProfile {
  name: string;
  headline: string;
  summary: readonly string[];
  facts: readonly { label: string; value: string }[];
  experience: readonly Experience[];
  education: Education;
  certifications: readonly { label: string; href?: string }[];
  skills: readonly SkillGroup[];
  links: readonly ExternalLink[];
}

export const profile = {
  name: "Nikita Reshetnik",
  headline: "Senior AI Engineer with a Software/.NET foundation",
  summary: [
    "I’m Nikita, an AI Engineer with a Software/.NET foundation and 5 years of experience building enterprise software.",
    "I design LLM-powered services for extraction, classification, controlled rewriting, semantic matching, and embedding-based search, supported by automated evaluation pipelines that keep quality visible as prompts evolve.",
    "I also ship .NET services, lead cross-functional delivery, improve engineering workflows, and help teams adopt AI development tools in day-to-day work.",
  ],
  facts: [
    { label: "Based in", value: "Europe" },
    { label: "Current role", value: "Senior AI Engineer" },
    { label: "Education", value: "Bachelor, Software Engineering" },
    { label: "Languages", value: "English, Ukrainian, Russian" },
  ],
  experience: [
    {
      organization: "DraftKings",
      role: "Senior AI Engineer",
      period: "April 2026 — Present",
      summary: "Working on an internal AI platform that helps engineers ship faster through AI-assisted development workflows, automated code generation, intelligent documentation, and structured enablement programs.",
      highlights: [],
    },
    {
      organization: "ELEKS",
      role: "AI Engineer",
      period: "November 2024 — March 2026",
      summary: "Designed and delivered a reusable LLM-powered REST service for extraction, classification, controlled rewriting, suggestions, semantic matching, and embedding-based prediction search. Built evaluation and observability workflows around the AI features and led cross-functional delivery.",
      highlights: [
        "Built automated prompt-quality pipelines covering Accuracy, Macro and Micro F1, and LLM-as-a-Judge Correctness, Faithfulness, and Relevance.",
        "Led delivery across engineering, QA, MLOps, Data Science, DevOps, and Product.",
        "Created documentation and onboarding material and led practical AI-tooling sessions.",
      ],
    },
    {
      organization: "ELEKS",
      role: "Software Engineer",
      period: "December 2023 — November 2024",
      summary: "Delivered end-to-end features and fixes across RESTful microservices, a monolithic application, plugin packages, and a desktop client. Improved SQL performance, code quality, release reliability, and day-to-day Agile delivery.",
      highlights: [],
    },
    {
      organization: "ELEKS",
      role: "Junior Software Engineer",
      period: "May 2022 — December 2023",
      summary: "Delivered features and fixes across REST APIs, microservices, a monolith, and plugin packages. Supported client investigations and strengthened team knowledge through documentation and a shared SQL query library.",
      highlights: [],
    },
    {
      organization: "ELEKS",
      role: "Trainee Software Engineer",
      period: "December 2021 — May 2022",
      summary: "Delivered supervised REST API work and small but important fixes while learning the system architecture, modern .NET practices, and the time-management and legal domain.",
      highlights: [],
    },
    {
      organization: "ELEKS",
      role: "Software Engineer Intern",
      period: "September 2021 — November 2021",
      summary: "Built AutoHubAPI as a practical environment for learning REST API development, then presented the application and progress to company management.",
      highlights: [],
    },
    {
      organization: "Sigma Software Group",
      role: "Software Engineer Intern",
      period: "March 2021 — April 2021",
      summary: "Worked across design, front-end, back-end, and testing on a team-built car-rental application. Used UML and Figma to guide implementation and achieved more than 80% unit and integration test coverage on the back-end.",
      highlights: [],
    },
  ],
  education: {
    institution: "State University of Information and Communication Technologies",
    qualification: "Bachelor, Software Engineering",
    period: "September 2019 — June 2023",
  },
  certifications: [
    { label: "Azure AI Fundamentals — Microsoft, August 2025" },
    { label: "GitHub Copilot — GitHub, June 2025" },
  ] as PortfolioProfile["certifications"],
  skills: [
    { title: "AI engineering", skills: ["LLMs", "Embeddings", "Prompt evaluation", "Semantic search", "Retrieval evaluation"] },
    { title: "Software engineering", skills: [".NET", "REST", "Elasticsearch", "Kafka", "Microsoft SQL Server", "CI/CD"] },
    { title: "Engineering enablement", skills: ["Grafana", "GitHub Copilot", "Cursor", "Technical documentation", "Team leadership"] },
  ],
  links: [
    { label: "LinkedIn", href: "https://www.linkedin.com/in/nikitareshetnik/" },
    { label: "GitHub", href: "https://github.com/grafanaKibana" },
    { label: "Email", href: "mailto:reshetnik.nikita@gmail.com" },
  ],
} satisfies PortfolioProfile;
