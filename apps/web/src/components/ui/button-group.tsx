import * as React from "react"
import { cn } from "../../lib/utils"

function ButtonGroup({ className, children, ref, ...props }: React.HTMLAttributes<HTMLDivElement> & { orientation?: string; ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} className={cn("inline-flex items-center gap-1", className)} {...props}>
      {children}
    </div>
  )
}
ButtonGroup.displayName = "ButtonGroup"

function ButtonGroupItem({ className, children, ref, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { ref?: React.Ref<HTMLButtonElement> }) {
  return (
    <button ref={ref} className={cn("inline-flex items-center justify-center", className)} {...props}>
      {children}
    </button>
  )
}
ButtonGroupItem.displayName = "ButtonGroupItem"

function ButtonGroupText({ className, children, ref, ...props }: React.HTMLAttributes<HTMLSpanElement> & { asChild?: boolean; ref?: React.Ref<HTMLSpanElement> }) {
  return (
    <span ref={ref} className={cn("text-sm", className)} {...props}>
      {children}
    </span>
  )
}
ButtonGroupText.displayName = "ButtonGroupText"

export { ButtonGroup, ButtonGroupItem, ButtonGroupText }
