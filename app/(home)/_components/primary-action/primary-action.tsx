import { clsx } from "clsx";
import type { ReactNode } from "react";
import styles from "./primary-action.module.scss";

interface PrimaryActionProps {
  children: ReactNode;
  disabled?: boolean;
  download?: boolean;
  href?: string;
  type?: "button" | "submit";
}

/**
 * Renders the shared primary action as a native link or button.
 *
 * @param children - Visible action content.
 * @param disabled - Whether a button action is unavailable.
 * @param download - Whether a link downloads its target.
 * @param href - Optional link destination.
 * @param type - Native button behavior when no link destination exists.
 * @returns The primary action element.
 */
export function PrimaryAction({
  children,
  disabled,
  download,
  href,
  type = "button",
}: PrimaryActionProps) {
  const className = clsx(
    styles.action,
    "inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-transparent bg-primary px-5 font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:opacity-40 motion-reduce:transition-none lg:w-auto lg:px-4 lg:leading-5",
  );

  if (href) {
    return (
      <a className={className} download={download} href={href}>
        {children}
      </a>
    );
  }

  return (
    <button className={className} disabled={disabled} type={type}>
      {children}
    </button>
  );
}
