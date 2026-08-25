/**
 * Nombre de pantalla para `screen_view` a partir de los segmentos de Expo
 * Router (#636).
 *
 * El layout mandaba `usePathname()`, que es la ruta RESUELTA: cada reto, cada
 * batalla y cada carrera abría su propia pantalla en OpenPanel
 * (`/challenges/abc123`, `/challenges/def456`, …), así que el informe de vistas
 * era una lista interminable de ids y no había forma de saber cuánta gente ve
 * la pantalla de detalle de un reto. `useSegments()` devuelve el PATRÓN
 * (`['challenges', '[id]']`), que es de cardinalidad fija.
 *
 * Los grupos de ruta —los segmentos entre paréntesis, `(tabs)`— no salen: no
 * existen en la URL que ve el usuario y solo harían que la misma pantalla
 * apareciese con dos nombres si algún día cambia de grupo.
 */
export function screenPattern(segments: readonly string[]): string {
  const path = segments
    .filter(segment => !(segment.startsWith('(') && segment.endsWith(')')))
    .join('/')
  return path ? `/${path}` : '/'
}
