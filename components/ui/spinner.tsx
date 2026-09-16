import { cn } from "./utils"
import { Loader2Icon } from "lucide-react"

/**
 * Renders the shared Spinner UI primitive.
 *
 * @param className - Optional classes merged with the default styles.
 * @param props - Remaining properties forwarded to the underlying primitive.
 * @returns The configured UI element.
 */
function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loader2Icon data-slot="spinner" role="status" aria-label="Loading" className={cn("size-4 animate-spin", className)} {...props} />
  )
}

export { Spinner }
