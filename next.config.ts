import createMDX from "@next/mdx";
import { resolve } from "node:path";
import type { NextConfig } from "next";
import type { Options as PrettyCodeOptions } from "rehype-pretty-code";

const prettyCodeOptions = {
  bypassInlineCode: true,
  defaultLang: { block: "plaintext" },
  keepBackground: false,
  theme: {
    dark: "github-dark-dimmed",
    light: "github-light",
  },
} satisfies PrettyCodeOptions;

const withMDX = createMDX({
  options: {
    remarkPlugins: [resolve(process.cwd(), "lib/content/ask-text-plugin.mjs")],
    rehypePlugins: [["rehype-pretty-code", prettyCodeOptions]],
  },
});

const nextConfig: NextConfig = {
  pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],
};

export default withMDX(nextConfig);
