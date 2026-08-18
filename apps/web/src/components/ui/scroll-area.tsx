import * as React from "react"
import { cn } from "../../lib/utils"

function ScrollArea({ className, children, ref, ...props }: React.HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} className={cn("relative overflow-auto", className)} {...props}>
      {children}
    </div>
  )
}
ScrollArea.displayName = "ScrollArea"

function ScrollBar({ className, ref, ...props }: React.HTMLAttributes<HTMLDivElement> & { orientation?: string; ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} className={cn("", className)} {...props} />
  )
}
ScrollBar.displayName = "ScrollBar"

export { ScrollArea, ScrollBar }
