import * as React from "react"
import { cn } from "../../lib/utils"

const Switch = React.forwardRef<HTMLButtonElement, any>(
  ({ className, ...props }, ref) => (
    <button ref={ref} className={cn("", className)} {...props} />
  )
)
Switch.displayName = "Switch"

export { Switch }
