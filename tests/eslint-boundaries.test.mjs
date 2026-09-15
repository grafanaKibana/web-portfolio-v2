import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { ESLint } from "eslint";

import eslintConfig, {
  strictColocationOptions,
  strictColocationZones,
} from "../eslint.config.mjs";

const registeredConfig = eslintConfig.find((config) => config.plugins?.import);
const parserConfig = eslintConfig.find((config) => config.name === "next/typescript");
const scriptBoundaryConfig = eslintConfig.find((config) =>
  config.files?.includes("scripts/**/*.{js,cjs,mjs,ts}")
  && config.rules?.["import/no-restricted-paths"]);
assert.ok(registeredConfig?.plugins?.import);
assert.ok(parserConfig?.languageOptions?.parser);
assert.ok(scriptBoundaryConfig);

/**
 * Writes a fixture file and creates its parent directories.
 *
 * @param root - Temporary fixture root.
 * @param path - Repository-shaped relative path.
 * @param source - Source text to write.
 */
async function writeFixture(root, path, source = "export const fixture = true;\n") {
  const destination = join(root, path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, source);
}

/**
 * Creates an ESLint instance using the repository's registered parser, plugin, resolver, and zones.
 *
 * @param root - Temporary fixture root used as the rebased architecture boundary.
 * @param options - Complete repository boundary options rebased by the caller.
 * @param selectedConfig - Calculated flat config whose parser, plugin, and resolver should be preserved.
 * @returns A configured ESLint instance.
 */
function fixtureEslint(
  root,
  options = { ...strictColocationOptions, basePath: root },
  selectedConfig = parserConfig,
) {
  const resolverSettings = selectedConfig.settings ?? registeredConfig.settings;
  return new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: {
      files: ["**/*.{js,jsx,cjs,mjs,ts,tsx,mts}"],
      languageOptions: {
        parser: selectedConfig.languageOptions?.parser ?? parserConfig.languageOptions.parser,
        parserOptions: {
          ecmaVersion: "latest",
          sourceType: selectedConfig.languageOptions?.sourceType ?? "module",
        },
      },
      plugins: { import: selectedConfig.plugins?.import ?? registeredConfig.plugins.import },
      settings: {
        ...resolverSettings,
        "import/resolver": {
          ...resolverSettings?.["import/resolver"],
          typescript: {
            ...resolverSettings?.["import/resolver"]?.typescript,
            project: join(root, "tsconfig.json"),
          },
        },
      },
      rules: {
        "import/no-unresolved": "error",
        "import/no-restricted-paths": ["error", options],
      },
    },
  });
}

/**
 * Creates a canonical temporary root so resolved imports and boundary paths share one prefix.
 *
 * @param prefix - Stable fixture directory prefix.
 * @returns Canonical temporary directory path.
 */
async function createFixtureRoot(prefix) {
  return realpath(await mkdtemp(join(tmpdir(), prefix)));
}

test("strict colocation zones enforce resolved aliases, relatives, exports, types, and dynamic imports", async (t) => {
  const root = await createFixtureRoot("portfolio-eslint-boundaries-");
  t.after(() => rm(root, { force: true, recursive: true }));

  await writeFixture(root, "tsconfig.json", JSON.stringify({
    compilerOptions: { baseUrl: ".", paths: { "@/*": ["./*"] } },
  }));
  await Promise.all([
    writeFixture(root, "components/site-header/site-header.tsx"),
    writeFixture(root, "components/site-header/mobile-navigation/helper.ts"),
    writeFixture(root, "components/site-footer/site-footer.tsx"),
    writeFixture(root, "components/site-footer/format-time.ts", "export type Format = string;\nexport const format = true;\n"),
    writeFixture(root, "components/ui/button.tsx"),
    writeFixture(root, "components/ui/utils.ts"),
    writeFixture(root, "components/theme/theme.tsx"),
    writeFixture(root, "lib/content/load.ts"),
    writeFixture(root, "content/articles/fixture.mdx", "# Fixture\n"),
    writeFixture(root, "mdx-components.tsx"),
    writeFixture(root, "app/(home)/_components/hero/hero.tsx"),
    writeFixture(root, "app/(home)/_components/hero/descriptor-rotation/descriptor-sequence.ts"),
    writeFixture(root, "app/(home)/_components/about/about.tsx"),
    writeFixture(root, "app/projects/[slug]/_lib/plugin-links.ts"),
    writeFixture(root, "app/projects/[slug]/page.tsx"),
    writeFixture(root, "app/articles/page.tsx"),
    writeFixture(root, "tests/route-fixture.ts"),
    writeFixture(root, "lib/content/load.test.ts"),
    writeFixture(root, "tests/root-quality.test.ts"),
    writeFixture(root, "app/(home)/_components/hero/private.server.test.ts"),
  ]);

  const cases = [
    ["app/layout.tsx", 'import "@/components/site-header/site-header";', 0],
    ["components/site-footer/local-time.tsx", 'import type { Format } from "./format-time";', 0],
    ["components/site-header/site-header.tsx", 'import "./mobile-navigation/helper";', 0],
    ["components/ui/field.tsx", 'export { fixture } from "@/components/ui/button";', 0],
    ["lib/content/load.ts", 'import "@/content/articles/fixture.mdx";', 0],
    ["app/(home)/page.tsx", 'import "@/app/(home)/_components/hero/hero";', 0],
    ["app/(home)/page.tsx", 'import "@/lib/content/load";', 0],
    ["app/projects/[slug]/page.tsx", 'import "./_lib/plugin-links";', 0],
    ["tests/quality.test.ts", 'import "@/app/(home)/_components/hero/hero";', 0],
    ["components/site-footer/local-time.tsx", 'import("@/components/site-footer/format-time");', 0],
    ["lib/shared.ts", 'import "@/app/(home)/_components/hero/hero";', 1],
    ["app/projects/page.tsx", 'import "@/app/(home)/_components/hero/descriptor-rotation/descriptor-sequence";', 1],
    ["app/articles/page.tsx", 'import "@/app/projects/[slug]/_lib/plugin-links";', 1],
    ["app/(home)/_components/about/about.tsx", 'import "../hero/descriptor-rotation/descriptor-sequence";', 1],
    ["components/ui/button.tsx", 'import "@/components/theme/theme";', 1],
    ["components/ui/button.tsx", 'import "@/lib/content/load";', 1],
    ["components/ui/button.tsx", 'import "@/content/articles/fixture.mdx";', 1],
    ["components/ui/button.tsx", 'import "@/mdx-components";', 1],
    ["lib/content/load.ts", 'export { fixture } from "@/components/site-header/site-header";', 1],
    ["lib/content/load.ts", 'import "@/mdx-components";', 1],
    ["lib/shared.ts", 'import type { FixtureType } from "@/app/(home)/_components/hero/hero";', 1],
    ["components/site-footer/local-time.tsx", 'import "@/components/site-header/mobile-navigation/helper";', 1],
    ["lib/shared.ts", 'import("@/app/(home)/_components/hero/hero");', 1],
    ["lib/content/load.ts", 'import "./load.test";', 1],
    ["lib/content/load.ts", 'import "@/tests/root-quality.test";', 1],
    ["app/(home)/_components/hero/hero.tsx", 'import "./private.server.test";', 1],
    ["app/(home)/_components/hero/descriptor-rotation/descriptor-sequence.test.ts", 'import "./descriptor-sequence";', 0],
  ];

  const companionZones = strictColocationZones.filter(({ message }) =>
    message === "Import a shared component through its public entry."
    || message === "Import a Home component through its public entry.");
  for (const [index, zone] of companionZones.entries()) {
    assert.equal(typeof zone.from, "string");
    const owner = zone.from.replace(/^\.\//, "");
    const entry = zone.except?.find((candidate) => candidate.endsWith(".tsx"));
    assert.ok(entry);
    const entryPath = `${owner}/${entry.replace(/^\.\//, "")}`;
    const helperPath = `${owner}/private-helper.ts`;
    await Promise.all([
      writeFixture(root, entryPath, "export type FixtureType = string;\nexport const fixture = true;\n"),
      writeFixture(root, helperPath),
    ]);
    if (owner.startsWith("components/")) {
      cases.push([`app/layout-owner-${String(index)}.tsx`, `import "@/${entryPath}";`, 0]);
      cases.push([`lib/owner-check-${String(index)}.ts`, `import "@/${helperPath}";`, 1]);
    } else {
      cases.push(["app/(home)/page.tsx", `import "@/${entryPath}";`, 0]);
      const sibling = owner.endsWith("/about") ? "hero" : "about";
      cases.push([
        `app/(home)/_components/${sibling}/owner-check-${String(index)}.ts`,
        `import "@/${helperPath}";`,
        1,
      ]);
    }
  }
  const eslint = fixtureEslint(root);

  for (const [path, source, forbidden] of cases) {
    const [result] = await eslint.lintText(source, { filePath: join(root, path) });
    assert.ok(result);
    assert.equal(
      result.messages.filter(({ ruleId }) => ruleId === "import/no-unresolved").length,
      0,
      `${path} must resolve before its boundary result is trusted`,
    );
    const boundaryErrors = result.messages.filter(({ ruleId }) => ruleId === "import/no-restricted-paths");
    assert.equal(boundaryErrors.length > 0, forbidden === 1, `${path}: ${source}`);
  }

  const [unresolved] = await eslint.lintText('import "@/missing/module";', {
    filePath: join(root, "lib/unresolved.ts"),
  });
  assert.equal(unresolved?.messages.some(({ ruleId }) => ruleId === "import/no-unresolved"), true);
  assert.equal(root.startsWith(process.cwd()), false);
});

test("production scripts reject test imports using their actual configured restriction", async (t) => {
  const root = await createFixtureRoot("portfolio-eslint-scripts-");
  t.after(() => rm(root, { force: true, recursive: true }));
  await Promise.all([
    writeFixture(root, "scripts/generate.mjs"),
    writeFixture(root, "tests/generate.test.ts"),
  ]);
  const configuredRule = scriptBoundaryConfig.rules["import/no-restricted-paths"];
  assert.ok(Array.isArray(configuredRule));
  const options = { ...configuredRule[1], basePath: root };
  const [result] = await fixtureEslint(root, options).lintText(
    'import "../tests/generate.test";',
    { filePath: join(root, "scripts/generate.mjs") },
  );
  assert.equal(result?.messages.some(({ ruleId }) => ruleId === "import/no-unresolved"), false);
  assert.equal(result?.messages.some(({ ruleId }) => ruleId === "import/no-restricted-paths"), true);
});

test("the real flat config enforces every supported production source extension", async (t) => {
  const root = await createFixtureRoot("portfolio-eslint-extensions-");
  t.after(() => rm(root, { force: true, recursive: true }));
  await Promise.all([
    writeFixture(root, "tsconfig.json", JSON.stringify({
      compilerOptions: { baseUrl: ".", paths: { "@/*": ["./*"] } },
    })),
    writeFixture(root, "lib/content/load.ts"),
    writeFixture(root, "app/(home)/_components/hero/hero.tsx"),
  ]);
  const eslint = new ESLint({ cwd: process.cwd() });
  for (const extension of ["js", "jsx", "cjs", "mjs", "ts", "tsx", "mts"]) {
    for (const scope of ["app", "components", "lib"]) {
      const config = await eslint.calculateConfigForFile(`${scope}/boundary-fixture.${extension}`);
      assert.ok(config?.rules?.["import/no-restricted-paths"], `${scope} ${extension} must select boundary rules`);
    }
    const selectedConfig = await eslint.calculateConfigForFile(`lib/boundary-fixture.${extension}`);
    assert.ok(selectedConfig);
    const configuredRule = selectedConfig.rules?.["import/no-restricted-paths"];
    assert.ok(Array.isArray(configuredRule));
    const fixture = fixtureEslint(
      root,
      { ...configuredRule[1], basePath: root },
      selectedConfig,
    );
    const allowedSource = extension === "cjs"
      ? 'import("@/lib/content/load");'
      : 'import "@/lib/content/load";';
    const forbiddenSource = extension === "cjs"
      ? 'import("@/app/(home)/_components/hero/hero");'
      : 'import "@/app/(home)/_components/hero/hero";';
    const [[allowed], [forbidden]] = await Promise.all([
      fixture.lintText(allowedSource, { filePath: join(root, `app/(home)/page.${extension}`) }),
      fixture.lintText(forbiddenSource, { filePath: join(root, `lib/shared.${extension}`) }),
    ]);
    assert.ok(allowed && forbidden);
    assert.equal(allowed.messages.some(({ ruleId }) => ruleId === "import/no-restricted-paths"), false);
    assert.equal(forbidden.messages.some(({ ruleId }) => ruleId === "import/no-unresolved"), false);
    assert.equal(
      forbidden.messages.some(({ ruleId }) => ruleId === "import/no-restricted-paths"),
      true,
      `${extension}: ${JSON.stringify(forbidden.messages)}`,
    );
  }
  const mdxProviderConfig = await eslint.calculateConfigForFile("mdx-components.tsx");
  assert.ok(mdxProviderConfig?.rules?.["import/no-restricted-paths"]);
  const testConfig = await eslint.calculateConfigForFile("lib/boundary-fixture.test.js");
  assert.equal(testConfig?.rules?.["import/no-restricted-paths"], undefined);
});

test("a candidate component owner requires an explicit public-entry zone before merging", async (t) => {
  const root = await createFixtureRoot("portfolio-eslint-new-owner-");
  t.after(() => rm(root, { force: true, recursive: true }));
  await Promise.all([
    writeFixture(root, "tsconfig.json", JSON.stringify({
      compilerOptions: { baseUrl: ".", paths: { "@/*": ["./*"] } },
    })),
    writeFixture(root, "components/notice/notice.tsx"),
    writeFixture(root, "components/notice/private-helper.ts"),
  ]);
  const candidateZone = {
    target: ["./components/!(notice)/**/*", "./lib", "./app/layout.tsx"],
    from: "./components/notice",
    except: ["./notice.tsx"],
    message: "Import a shared component through its public entry.",
  };
  const consumerPath = join(root, "components/site-footer/notice-consumer.tsx");
  const [beforeZone] = await fixtureEslint(root).lintText(
    'import "@/components/notice/private-helper";',
    { filePath: consumerPath },
  );
  assert.ok(beforeZone);
  assert.equal(beforeZone.messages.some(({ ruleId }) => ruleId === "import/no-unresolved"), false);
  assert.equal(beforeZone.messages.some(({ ruleId }) => ruleId === "import/no-restricted-paths"), false);

  const eslint = fixtureEslint(root, {
    ...strictColocationOptions,
    basePath: root,
    zones: [...strictColocationOptions.zones, candidateZone],
  });
  const [[entry], [companion]] = await Promise.all([
    eslint.lintText('import "@/components/notice/notice";', {
      filePath: consumerPath,
    }),
    eslint.lintText('import "@/components/notice/private-helper";', {
      filePath: consumerPath,
    }),
  ]);
  assert.ok(entry && companion);
  assert.equal(entry.messages.some(({ ruleId }) => ruleId === "import/no-restricted-paths"), false);
  assert.equal(companion.messages.some(({ ruleId }) => ruleId === "import/no-restricted-paths"), true);
});
