import { clsx } from "clsx";
import type { MDXComponents } from "mdx/types";
import type { ComponentProps } from "react";
import styles from "./mdx-components.module.scss";

const components = {
  /**
   * Applies the primary portfolio style to an MDX heading.
   *
   * @param props - Native heading properties supplied by MDX.
   * @returns The styled heading.
   */
  h1: (props: ComponentProps<"h1">) => (
    <h1 {...props} className="text-4xl font-semibold tracking-tight" />
  ),
  /**
   * Applies section spacing and hierarchy to an MDX level-two heading.
   *
   * @param props - Native heading properties supplied by MDX.
   * @returns The styled heading.
   */
  h2: (props: ComponentProps<"h2">) => (
    <h2 {...props} className="mt-12 text-2xl font-semibold tracking-tight" />
  ),
  /**
   * Applies subsection spacing and hierarchy to an MDX level-three heading.
   *
   * @param props - Native heading properties supplied by MDX.
   * @returns The styled heading.
   */
  h3: (props: ComponentProps<"h3">) => (
    <h3 {...props} className="mt-10 text-xl font-semibold tracking-tight" />
  ),
  /**
   * Applies readable measure and color to an MDX paragraph.
   *
   * @param props - Native paragraph properties supplied by MDX.
   * @returns The styled paragraph.
   */
  p: (props: ComponentProps<"p">) => (
    <p {...props} className="mt-6 leading-8 text-foreground" />
  ),
  /**
   * Applies spacing and markers to an MDX unordered list.
   *
   * @param props - Native list properties supplied by MDX.
   * @returns The styled unordered list.
   */
  ul: (props: ComponentProps<"ul">) => (
    <ul {...props} className="mt-6 list-disc space-y-2 pl-6" />
  ),
  /**
   * Applies spacing and markers to an MDX ordered list.
   *
   * @param props - Native list properties supplied by MDX.
   * @returns The styled ordered list.
   */
  ol: (props: ComponentProps<"ol">) => (
    <ol {...props} className="mt-6 list-decimal space-y-2 pl-6" />
  ),
  /**
   * Applies the editorial accent rule to an MDX quotation.
   *
   * @param props - Native quotation properties supplied by MDX.
   * @returns The styled quotation.
   */
  blockquote: (props: ComponentProps<"blockquote">) => (
    <blockquote
      {...props}
      className={clsx(styles.blockquote, "mt-6 border-l-2 border-accent-em pl-5")}
    />
  ),
  /**
   * Applies the accessible portfolio treatment to an MDX anchor.
   *
   * @param props - Native anchor properties supplied by MDX.
   * @returns The styled anchor.
   */
  a: (props: ComponentProps<"a">) => (
    <a
      {...props}
      className="rounded-sm font-medium text-foreground underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
    />
  ),
  /**
   * Applies the monospace treatment to inline MDX code.
   *
   * @param props - Native code properties supplied by MDX.
   * @returns The styled inline code.
   */
  code: (props: ComponentProps<"code">) => (
    <code {...props} className={clsx(props.className, "break-words font-mono text-sm")} />
  ),
  /**
   * Applies overflow-safe styling to an MDX code block.
   *
   * @param props - Native preformatted-text properties supplied by MDX.
   * @returns The styled code block.
   */
  pre: (props: ComponentProps<"pre">) => (
    <pre
      {...props}
      className={clsx(
        props.className,
        styles.codeBlock,
        "mt-6 overflow-x-auto rounded-lg bg-muted/50 p-4",
      )}
    />
  ),
} satisfies MDXComponents;

/**
 * Provides the approved component map for local MDX documents.
 *
 * @returns The shared MDX component map.
 */
export function useMDXComponents(): MDXComponents {
  return components;
}
