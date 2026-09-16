import * as React from "react"
import { cn } from "./utils"

/**
 * Renders the shared MessageGroup UI primitive.
 *
 * @param className - Optional classes merged with the default styles.
 * @param props - Remaining properties forwarded to the underlying primitive.
 * @returns The configured UI element.
 */
function MessageGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="message-group"
      className={cn("flex min-w-0 flex-col gap-2", className)}
      {...props}
    />
  )
}

/**
 * Renders the shared Message UI primitive.
 *
 * @param className - Optional classes merged with the default styles.
 * @param align - Alignment within the owning primitive.
 * @param props - Remaining properties forwarded to the underlying primitive.
 * @returns The configured UI element.
 */
function Message({
  className,
  align = "start",
  ...props
}: React.ComponentProps<"div"> & { align?: "start" | "end" }) {
  return (
    <div
      data-slot="message"
      data-align={align}
      className={cn(
        "group/message relative flex w-full min-w-0 gap-2 text-sm data-[align=end]:flex-row-reverse",
        className
      )}
      {...props}
    />
  )
}

/**
 * Renders the shared MessageAvatar UI primitive.
 *
 * @param className - Optional classes merged with the default styles.
 * @param props - Remaining properties forwarded to the underlying primitive.
 * @returns The configured UI element.
 */
function MessageAvatar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="message-avatar"
      className={cn(
        "flex w-fit min-w-8 shrink-0 items-center justify-center self-end overflow-hidden rounded-full bg-muted group-has-data-[slot=message-footer]/message:-translate-y-8",
        className
      )}
      {...props}
    />
  )
}

/**
 * Renders the shared MessageContent UI primitive.
 *
 * @param className - Optional classes merged with the default styles.
 * @param props - Remaining properties forwarded to the underlying primitive.
 * @returns The configured UI element.
 */
function MessageContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="message-content"
      className={cn(
        "flex w-full min-w-0 flex-col gap-2.5 wrap-break-word group-data-[align=end]/message:*:data-slot:self-end",
        className
      )}
      {...props}
    />
  )
}

/**
 * Renders the shared MessageHeader UI primitive.
 *
 * @param className - Optional classes merged with the default styles.
 * @param props - Remaining properties forwarded to the underlying primitive.
 * @returns The configured UI element.
 */
function MessageHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="message-header"
      className={cn(
        "flex max-w-full min-w-0 items-center px-3.5 text-xs font-medium text-muted-foreground group-has-data-[variant=ghost]/message:px-0",
        className
      )}
      {...props}
    />
  )
}

/**
 * Renders the shared MessageFooter UI primitive.
 *
 * @param className - Optional classes merged with the default styles.
 * @param props - Remaining properties forwarded to the underlying primitive.
 * @returns The configured UI element.
 */
function MessageFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="message-footer"
      className={cn(
        "flex max-w-full min-w-0 items-center px-3.5 text-xs font-medium text-muted-foreground group-has-data-[variant=ghost]/message:px-0 group-data-[align=end]/message:justify-end",
        className
      )}
      {...props}
    />
  )
}

export {
  MessageGroup,
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageHeader,
}
