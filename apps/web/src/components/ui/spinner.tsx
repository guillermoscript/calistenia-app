import * as React from 'react'
import { cn } from '../../lib/utils'

interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Nombre accesible; sin él el `role="status"` no anuncia nada. */
  label?: string
}

/**
 * Círculo de carga que hereda el color del texto.
 *
 * Entró en el #43 como stub —un `<div className="animate-spin">` sin borde ni
 * fondo, es decir, invisible— y así se quedó. Los dos botones de la despensa
 * que lo pintan mientras esperan a la API (`PantryChatInput`,
 * `PantryConfirmDialog`) sustituyen su contenido por él, así que durante toda
 * la espera el botón se quedaba literalmente en blanco (#485).
 *
 * El borde es `border-current` a propósito: se pinta tanto sobre el botón lima
 * (texto oscuro) como sobre el apagado (texto claro), y quien lo llama no tiene
 * que decidir de qué color va. `border-t-transparent` es lo que deja ver el
 * giro — un anillo completo girando no se distingue de uno quieto.
 */
const Spinner = React.forwardRef<HTMLDivElement, SpinnerProps>(
  ({ className, label, ...props }, ref) => (
    <div
      ref={ref}
      role="status"
      aria-label={label}
      className={cn(
        'inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent',
        className,
      )}
      {...props}
    />
  ),
)
Spinner.displayName = 'Spinner'

export { Spinner }
