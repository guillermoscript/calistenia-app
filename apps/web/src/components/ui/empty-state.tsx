import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'

/**
 * Estado vacío de una lista o pantalla (issue #488).
 *
 * El patrón ya existía copiado en media docena de páginas —retos, feed,
 * ranking, notificaciones, carreras—: bloque centrado, icono, una línea que
 * dice qué falta, una segunda más pequeña que explica cómo llenarlo y, a
 * veces, un CTA. Lo que variaba entre copias eran los márgenes, no el diseño.
 *
 * **No es el `EmptyState` de la app nativa.** El de móvil
 * (`apps/mobile/src/components/ui/empty-state.tsx`) es una tarjeta con filete
 * discontinuo, título en Bebas y pastilla lima; este es el bloque centrado y
 * sin caja que la web lleva usando desde siempre. Unificar los dos diseños es
 * una decisión de producto, no un refactor, así que cada plataforma conserva
 * el suyo y lo único que se comparte es tener el patrón nombrado en las dos.
 */
interface EmptyStateProps {
  /** Emoji o SVG. Se centra y se renderiza tal cual. */
  icon?: ReactNode
  /**
   * Extras del contenedor del icono — p. ej. una animación propia. Va en el
   * `div` y no envolviendo al icono porque `transform` no aplica a elementos
   * inline: un `<span>` intermedio mataría el flotado.
   */
  iconClassName?: string
  /** Qué falta. Una línea. */
  title: ReactNode
  /** Cómo llenarlo. Enseña la feature; no repitas el título. */
  hint?: ReactNode
  /** CTA opcional — normalmente un `<Button variant="limeSolid">`. */
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon, iconClassName, title, hint, action, className }: EmptyStateProps) {
  return (
    <div className={cn('text-center py-16 motion-safe:animate-scale-in', className)}>
      {icon ? <div className={cn('text-3xl mb-3', iconClassName)}>{icon}</div> : null}
      {/* El hueco bajo el título depende de qué venga detrás: pegado a la
          pista, separado del CTA, o nada si es lo último. */}
      <div className={cn('text-sm text-muted-foreground', hint ? 'mb-1' : action ? 'mb-4' : undefined)}>
        {title}
      </div>
      {hint ? (
        <div className={cn('text-xs text-muted-foreground', action ? 'mb-4' : undefined)}>{hint}</div>
      ) : null}
      {action}
    </div>
  )
}
