import * as React from "react"
import { cn } from "../../lib/utils"

const HoverCard = React.forwardRef<HTMLDivElement, any>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn("", className)} {...props}>{children}</div>
  )
)
HoverCard.displayName = "HoverCard"

const HoverCardTrigger = React.forwardRef<HTMLDivElement, any>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn("", className)} {...props}>{children}</div>
  )
)
HoverCardTrigger.displayName = "HoverCardTrigger"

const HoverCardContent = React.forwardRef<HTMLDivElement, any>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn("", className)} {...props}>{children}</div>
  )
)
HoverCardContent.displayName = "HoverCardContent"

export { HoverCard, HoverCardTrigger, HoverCardContent }
