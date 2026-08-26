import createMDX from "@next/mdx";
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
    rehypePlugins: [["rehype-pretty-code", prettyCodeOptions]],
  },
});

const nextConfig: NextConfig = {
  pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],
};

export default withMDX(nextConfig);
