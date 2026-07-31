import type { ReactNode } from 'react'

/**
 * Marca un subárbol como legible para el session replay de OpenPanel.
 *
 * El recorder arranca con `maskAllText: true`, así que por defecto todo el texto
 * de la app se graba como asteriscos (hay datos de salud de por medio). Las páginas
 * públicas de marketing no muestran datos personales, así que se envuelven aquí
 * para que los replays se puedan leer de verdad.
 *
 * `display: contents` hace que el wrapper no exista a efectos de layout: los hijos
 * siguen participando en el grid/flex del padre exactamente igual que sin él.
 *
 * Ojo: `unmaskTextSelector` se resuelve con `closest()`, o sea que desenmascara
 * TODO el subárbol. No envolver nada que renderice contenido de usuarios
 * (invitaciones, carreras, perfiles).
 */
export function MarketingUnmask({ children }: { children: ReactNode }) {
  return <div data-op-unmask style={{ display: 'contents' }}>{children}</div>
}

export default MarketingUnmask
