import * as React from "react"
import { cn } from "../../lib/utils"

const ButtonGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { orientation?: string }>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn("inline-flex items-center gap-1", className)} {...props}>
      {children}
    </div>
  )
)
ButtonGroup.displayName = "ButtonGroup"

const ButtonGroupItem = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, children, ...props }, ref) => (
    <button ref={ref} className={cn("inline-flex items-center justify-center", className)} {...props}>
      {children}
    </button>
  )
)
ButtonGroupItem.displayName = "ButtonGroupItem"

const ButtonGroupText = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement> & { asChild?: boolean }>(
  ({ className, children, ...props }, ref) => (
    <span ref={ref} className={cn("text-sm", className)} {...props}>
      {children}
    </span>
  )
)
ButtonGroupText.displayName = "ButtonGroupText"

export { ButtonGroup, ButtonGroupItem, ButtonGroupText }
