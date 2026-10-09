/**
 * Ruta de la pestaña Hoy tal como la devuelve `usePathname()`. Las barras
 * flotantes no salen aquí: el bloque «Hoy» ya enseña «Continuar». Si #859
 * mueve Hoy de ruta, se cambia aquí (y en `ACTIVE_BATTLE_POLL_PATHS`).
 *
 * Sin imports con `@/`: el Vitest del móvil no resuelve ese alias.
 */
export const HOME_TAB_PATH = '/'

export function isHomeTabPath(pathname: string | null | undefined): boolean {
  return pathname === HOME_TAB_PATH
}
