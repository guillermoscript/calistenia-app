import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '../../lib/utils'

/**
 * The uppercase mono label that names a block in the spec-sheet design system.
 *
 * It already existed, copy-pasted ~20 times as
 * `font-mono text-[10px] text-muted-foreground tracking-[3px] uppercase`, with
 * the size drifting between 9px and 11px and the tracking between 2px and 3px
 * depending on the file. Naming it fixes the drift and gives the planner
 * components one thing to import.
 *
 * `tone="lime"` is not decoration: lime means "interactable" in this system, so
 * a lime kicker labels a block the user can act on.
 */
const kickerVariants = cva('font-mono uppercase leading-none', {
  variants: {
    tone: {
      muted: 'text-muted-foreground',
      lime: 'text-lime',
      foreground: 'text-foreground',
    },
    size: {
      // 9px is the caption tier (nested labels); 10px is the default block label.
      xs: 'text-[9px] tracking-[2px]',
      sm: 'text-[10px] tracking-[3px]',
    },
  },
  defaultVariants: {
    tone: 'muted',
    size: 'sm',
  },
})

interface KickerProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof kickerVariants> {
  as?: 'div' | 'span'
}

function Kicker({ className, tone, size, as: Tag = 'div', ...props }: KickerProps) {
  return <Tag className={cn(kickerVariants({ tone, size }), className)} {...props} />
}

export { Kicker, kickerVariants }
export type { KickerProps }
