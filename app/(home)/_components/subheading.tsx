import type { ComponentProps, ReactNode } from "react";
import { clsx } from "clsx";
import { Marker, MarkerContent } from "@/components/ui/marker";

/** Props for a Home subsection heading and its label alignment. */
type SubheadingProps = Omit<ComponentProps<typeof Marker>, "children" | "render" | "variant"> & {
  align?: "start" | "center" | "end";
  children: ReactNode;
};

/**
 * Renders a Home subsection heading with the shared Skills divider and label style.
 *
 * @param align - Label alignment; defaults to the leading edge.
 * @param children - Subsection label.
 * @param className - Additional heading layout classes.
 * @param props - Heading attributes and optional layout classes.
 * @returns A semantic third-level heading.
 */
export function Subheading({ align = "start", children, className, ...props }: SubheadingProps) {
  return (
    <Marker
      render={<h3 />}
      variant="separator"
      {...props}
      className={clsx(
        "m-0 gap-6 font-mono text-xs leading-4.5 font-normal tracking-[0.08em] uppercase text-muted-foreground before:mr-0 after:ml-0",
        align === "start" && "text-left before:hidden",
        align === "center" && "text-center",
        align === "end" && "text-right after:hidden",
        className,
      )}
    >
      <MarkerContent className={clsx(
        "group-data-[variant=separator]/marker:flex-initial",
        align === "start" && "group-data-[variant=separator]/marker:text-left",
        align === "end" && "group-data-[variant=separator]/marker:text-right",
      )}>{children}</MarkerContent>
    </Marker>
  );
}
