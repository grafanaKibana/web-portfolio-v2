"use client"

import { Separator as SeparatorPrimitive } from "@base-ui/react/separator"
import { cn } from "./utils"

/**
 * Renders the shared Separator UI primitive.
 *
 * @param className - Optional classes merged with the default styles.
 * @param orientation - Layout direction for the field or separator.
 * @param props - Remaining properties forwarded to the underlying primitive.
 * @returns The configured UI element.
 */
function Separator({
  className,
  orientation = "horizontal",
  ...props
}: SeparatorPrimitive.Props) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn(
        "shrink-0 bg-border data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch",
        className
      )}
      {...props}
    />
  )
}

export { Separator }
