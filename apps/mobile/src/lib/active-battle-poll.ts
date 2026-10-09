/**
 * Dónde se sondea la batalla activa (#860).
 *
 * `findMyActiveBattle` corría cada 45 s en todas las pestañas porque la barra
 * flotante vive en el layout de las tabs. Solo hace falta con la batalla a la
 * vista: en Hoy (la barra) y en Comunidad (la fila de batalla activa). En el
 * resto la barra sigue saliendo con el último valor de la caché.
 *
 * Sin imports de `@/` a propósito: el Vitest del móvil no resuelve ese alias.
 */

/** Rutas (tal como las devuelve `usePathname`) con la batalla activa a la vista. */
export const ACTIVE_BATTLE_POLL_PATHS: ReadonlySet<string> = new Set(['/', '/community'])

export function shouldPollActiveBattle(pathname: string | null | undefined): boolean {
  return !!pathname && ACTIVE_BATTLE_POLL_PATHS.has(pathname)
}
