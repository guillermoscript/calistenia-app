import * as React from "react"
import { cn } from "../../lib/utils"

const InputGroup = React.forwardRef<HTMLDivElement, any>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn("", className)} {...props}>{children}</div>
  )
)
InputGroup.displayName = "InputGroup"

const InputGroupText = React.forwardRef<HTMLSpanElement, any>(
  ({ className, children, ...props }, ref) => (
    <span ref={ref} className={cn("", className)} {...props}>{children}</span>
  )
)
InputGroupText.displayName = "InputGroupText"

const InputGroupAddon = React.forwardRef<HTMLDivElement, any>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn("", className)} {...props}>{children}</div>
  )
)
InputGroupAddon.displayName = "InputGroupAddon"

const InputGroupButton = React.forwardRef<HTMLButtonElement, any>(
  ({ className, children, ...props }, ref) => (
    <button ref={ref} className={cn("", className)} {...props}>{children}</button>
  )
)
InputGroupButton.displayName = "InputGroupButton"

const InputGroupTextarea = React.forwardRef<HTMLTextAreaElement, any>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn("", className)} {...props} />
  )
)
InputGroupTextarea.displayName = "InputGroupTextarea"

const InputGroupInput = React.forwardRef<HTMLInputElement, any>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn("", className)} {...props} />
  )
)
InputGroupInput.displayName = "InputGroupInput"

export { InputGroup, InputGroupText, InputGroupAddon, InputGroupButton, InputGroupTextarea, InputGroupInput }
