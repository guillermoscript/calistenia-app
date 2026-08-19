/**
 * Kicker — port nativo del primitivo web (issue #488).
 *
 * Mismo `cva` que `apps/web/src/components/ui/kicker.tsx`: la etiqueta mono
 * en mayúsculas que nombra un bloque del spec-sheet. Aquí renderiza el
 * `Text` de la app en vez de un `div`/`span` (no existe ese concepto en
 * nativo, así que no hay prop `as`).
 *
 * Se omite `leading-none` de las clases base a propósito: en nativo fija un
 * lineHeight explícito y cambiaría la métrica vertical de todas las
 * etiquetas migradas — el objetivo de este port es que los call sites
 * migrados rendericen igual que antes, no que se ajusten a la web.
 */
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'

const kickerVariants = cva('font-mono uppercase', {
  variants: {
    tone: {
      muted: 'text-muted-foreground',
      lime: 'text-lime',
      foreground: 'text-foreground',
    },
    size: {
      xs: 'text-[9px] tracking-[2px]',
      sm: 'text-[10px] tracking-[3px]',
    },
  },
  defaultVariants: {
    tone: 'muted',
    size: 'sm',
  },
})

type KickerProps = React.ComponentProps<typeof Text> & VariantProps<typeof kickerVariants>

function Kicker({ className, tone, size, ...props }: KickerProps) {
  return <Text className={cn(kickerVariants({ tone, size }), className)} {...props} />
}

export { Kicker, kickerVariants }
export type { KickerProps }
