"use client"

import * as React from "react"
import { cn } from "./utils"

/**
 * Renders the shared Label UI primitive.
 *
 * @param className - Optional classes merged with the default styles.
 * @param props - Remaining properties forwarded to the underlying primitive.
 * @returns The configured UI element.
 */
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }
