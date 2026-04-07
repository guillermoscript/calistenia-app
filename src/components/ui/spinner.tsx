import * as React from "react"
import { cn } from "../../lib/utils"

const Spinner = React.forwardRef<HTMLDivElement, any>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("animate-spin", className)} {...props} />
  )
)
Spinner.displayName = "Spinner"

export { Spinner }
