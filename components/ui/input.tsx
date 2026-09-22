import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "./utils"

/**
 * Renders the shared Input UI primitive.
 *
 * @param className - Optional classes merged with the default styles.
 * @param type - Native input type.
 * @param props - Remaining properties forwarded to the underlying primitive.
 * @returns The configured UI element.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "field-surface field-control field-single-line w-full min-w-0 px-3 py-1 transition-[color,box-shadow,background-color] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
