import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

const nextImportConfig = nextVitals.find((config) => config.plugins?.import);
if (!nextImportConfig?.plugins?.import) {
  throw new Error("eslint-config-next must register eslint-plugin-import");
}

const routeScopes = [
  "./app/(home)",
  "./app/articles",
  "./app/projects",
  "./app/privacy",
  "./app/terms",
  "./app/accessibility",
  "./app/for-robots",
  "./app/api/ask",
];
const commonTargets = [
  "./components",
  "./lib",
  "./app/layout.tsx",
  "./app/robots.ts",
  "./app/sitemap.ts",
  "./mdx-components.tsx",
];
const componentOwners = [
  ["gradient-background", ["./index.ts"]],
  ["conversation", ["./conversation.tsx"]],
  ["not-found-page", ["./not-found-page.tsx"]],
  ["site-header", ["./site-header.tsx"]],
  ["site-footer", ["./site-footer.tsx"]],
  ["opening-splash", ["./opening-splash.tsx"]],
  ["page-motion", ["./page-motion.tsx", "./page-motion.module.scss"]],
  ["brand-mark", ["./brand-mark.tsx"]],
  ["smooth-scroll", ["./smooth-scroll.tsx"]],
  ["theme", ["./theme.tsx"]],
];
const homeOwners = [
  ["hero", ["./hero.tsx"]],
  ["experience", ["./experience.tsx"]],
  ["code-activity", ["./code-activity.tsx"]],
  ["contact", ["./contact.tsx"]],
  ["about", ["./about.tsx"]],
  ["education", ["./education.tsx"]],
  ["skills", ["./skills.tsx"]],
  ["projects", ["./projects.tsx"]],
  ["writing", ["./writing.tsx"]],
  ["editorial-row", ["./editorial-row.tsx"]],
];
const browserSafeRestrictedPaths = ["server-only", "langchain"];
const browserSafeRestrictedPatterns = [{
  group: ["node:*", "@langchain/*", "langchain/*", "@/app/*"],
  message: "Keep server dependencies inside the API route; conversation code and shared Ask modules must stay browser-safe.",
}];

/** Import zones that enforce the repository's nearest-owner colocation contract. */
export const strictColocationZones = [
  {
    target: commonTargets,
    from: routeScopes,
    message: "Move shared behavior to its common owner.",
  },
  ...routeScopes.map((route) => ({
    target: routeScopes.filter((candidate) => candidate !== route),
    from: route,
    message: "Do not import another route's implementation.",
  })),
  {
    target: [
      ...commonTargets,
      "./app/(home)",
      "./app/articles",
      "./app/privacy",
      "./app/terms",
      "./app/accessibility",
      "./app/for-robots",
      "./app/projects/page.tsx",
      "./app/projects/not-found.tsx",
    ],
    from: "./app/projects/\\[slug\\]/_lib/**",
    message: "Detail helpers belong to the detail route.",
  },
  {
    target: "./components/ui",
    from: "./components",
    except: ["./ui"],
    message: "UI controls expose general APIs; workflows stay with their owner.",
  },
  ...["./app", "./lib", "./content", "./mdx-components.tsx"].map((source) => ({
    target: "./components/ui",
    from: source,
    message: "UI controls expose general APIs; workflows stay with their owner.",
  })),
  ...["./components", "./mdx-components.tsx"].map((source) => ({
    target: "./lib",
    from: source,
    message: "Shared runtime code cannot depend on UI presentation.",
  })),
  ...componentOwners.map(([name, entries]) => ({
    target: [
      `./components/!(${name})/**/*`,
      "./lib",
      ...routeScopes,
      "./app/layout.tsx",
      "./app/robots.ts",
      "./app/sitemap.ts",
      "./mdx-components.tsx",
    ],
    from: `./components/${name}`,
    except: entries,
    message: "Import a shared component through its public entry.",
  })),
  ...homeOwners.map(([name, entries]) => ({
    target: [
      `./app/(home)/_components/!(${name})/**/*`,
      "./app/(home)/page.tsx",
      ...commonTargets,
      "./app/articles",
      "./app/projects",
      "./app/privacy",
      "./app/terms",
      "./app/accessibility",
      "./app/for-robots",
    ],
    from: `./app/(home)/_components/${name}`,
    except: entries,
    message: "Import a Home component through its public entry.",
  })),
  {
    target: "./components/conversation/conversation.service.ts",
    from: "./components/conversation",
    except: [
      "./conversation.models.ts",
      "./conversation.config.ts",
      "./conversation.errors.ts",
      "./ask-stream-parsing.ts",
    ],
    message: "ConversationService may depend only on its non-UI companions.",
  },
  {
    target: "./components/conversation/conversation.service.ts",
    from: "./components/ui",
    message: "ConversationService cannot depend on shared UI.",
  },
  {
    target: "./components/conversation/conversation.service.ts",
    from: "./lib",
    except: ["./ask.contract.ts", "./ask.config.ts"],
    message: "ConversationService may import only the shared Ask contract and limits from lib.",
  },
  {
    target: ["./app/**", "./components/**", "./lib/**", "./mdx-components.tsx"],
    from: "./tests/**",
    message: "Production modules cannot import tests.",
  },
  {
    target: ["./app/**", "./components/**", "./lib/**", "./mdx-components.tsx"],
    from: "./**/*.test.{js,jsx,cjs,mjs,ts,tsx,mts}",
    message: "Production modules cannot import tests.",
  },
];

/** ESLint options for enforcing strict colocation from the repository root. */
export const strictColocationOptions = {
  basePath: import.meta.dirname,
  zones: strictColocationZones,
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{ts,tsx,mts}"],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["**/*.tsx"],
    rules: {
      "react/forbid-dom-props": [
        "error",
        {
          forbid: [
            {
              propName: "style",
              message: "Use a CSS Module or SCSS class instead.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "components/conversation/**/*.{js,jsx,cjs,mjs,ts,tsx,mts}",
      "lib/ask.contract.ts",
      "lib/ask.config.ts",
    ],
    ignores: ["**/*.test.{js,jsx,cjs,mjs,ts,tsx,mts}"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: browserSafeRestrictedPaths,
        patterns: browserSafeRestrictedPatterns,
      }],
    },
  },
  {
    files: ["components/conversation/conversation.service.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: browserSafeRestrictedPaths,
        patterns: [
          ...browserSafeRestrictedPatterns,
          {
            group: ["react", "react/*", "react-dom", "react-dom/*"],
            message: "ConversationService must remain independent of React runtime and UI lifecycle.",
          },
        ],
      }],
    },
  },
  {
    files: ["**/*.test.{js,jsx,cjs,mjs,ts,tsx,mts}"],
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
    },
  },
  {
    files: [
      "app/**/*.cjs",
      "components/**/*.cjs",
      "lib/**/*.cjs",
      "scripts/**/*.cjs",
    ],
    plugins: { import: nextImportConfig.plugins.import },
    settings: nextImportConfig.settings,
  },
  {
    files: [
      "app/**/*.{js,jsx,cjs,mjs,ts,tsx,mts}",
      "components/**/*.{js,jsx,cjs,mjs,ts,tsx,mts}",
      "lib/**/*.{js,jsx,cjs,mjs,ts,tsx,mts}",
      "mdx-components.tsx",
    ],
    ignores: ["**/*.test.{js,jsx,cjs,mjs,ts,tsx,mts}"],
    rules: {
      "import/no-restricted-paths": ["error", strictColocationOptions],
    },
  },
  {
    files: ["scripts/**/*.{js,cjs,mjs,ts}"],
    ignores: ["**/*.test.{js,jsx,cjs,mjs,ts,tsx,mts}"],
    rules: {
      "import/no-restricted-paths": ["error", {
        basePath: import.meta.dirname,
        zones: [
          {
            target: "./scripts/**",
            from: "./tests/**",
            message: "Production scripts cannot import tests.",
          },
          {
            target: "./scripts/**",
            from: "./**/*.test.{js,jsx,cjs,mjs,ts,tsx,mts}",
            message: "Production scripts cannot import tests.",
          },
        ],
      }],
    },
  },
  {
    files: ["components/ui/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unnecessary-condition": "off",
    },
  },
  {
    files: [
      "app/**/*.{ts,tsx}",
      "components/**/*.{ts,tsx}",
      "content/**/*.{ts,tsx}",
      "lib/**/*.{ts,tsx}",
      "mdx-components.tsx",
    ],
    rules: {
      "max-lines-per-function": [
        "error",
        {
          max: 200,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-e2e-dev/**",
    ".omx/**",
    "design/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Reviewed generated upstream export; authored adapters and wrappers remain linted.
    "components/gradient-background/upstream/feral-gradient-runtime.jsx",
  ]),
]);

export default eslintConfig;
