import * as React from "react"
import { cn } from "../../lib/utils"

const Command = React.forwardRef<HTMLDivElement, any>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn("", className)} {...props}>{children}</div>
  )
)
Command.displayName = "Command"

const CommandInput = React.forwardRef<HTMLInputElement, any>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn("", className)} {...props} />
  )
)
CommandInput.displayName = "CommandInput"

const CommandList = React.forwardRef<HTMLDivElement, any>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn("", className)} {...props}>{children}</div>
  )
)
CommandList.displayName = "CommandList"

const CommandEmpty = React.forwardRef<HTMLDivElement, any>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn("", className)} {...props}>{children}</div>
  )
)
CommandEmpty.displayName = "CommandEmpty"

const CommandGroup = React.forwardRef<HTMLDivElement, any>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn("", className)} {...props}>{children}</div>
  )
)
CommandGroup.displayName = "CommandGroup"

const CommandItem = React.forwardRef<HTMLDivElement, any>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn("", className)} {...props}>{children}</div>
  )
)
CommandItem.displayName = "CommandItem"

const CommandSeparator = React.forwardRef<HTMLDivElement, any>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("", className)} {...props} />
  )
)
CommandSeparator.displayName = "CommandSeparator"

const CommandDialog = React.forwardRef<HTMLDivElement, any>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn("", className)} {...props}>{children}</div>
  )
)
CommandDialog.displayName = "CommandDialog"

const CommandShortcut = React.forwardRef<HTMLSpanElement, any>(
  ({ className, children, ...props }, ref) => (
    <span ref={ref} className={cn("", className)} {...props}>{children}</span>
  )
)
CommandShortcut.displayName = "CommandShortcut"

export { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator, CommandDialog, CommandShortcut }
