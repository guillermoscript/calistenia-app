/**
 * Comprobación de arranque: ¿las clases de NativeWind resuelven a estilos reales?
 *
 * Motivo (incidente 2026-08-07, v1.7.0 en Play): había dos copias de
 * react-native-css-interop en el bundle. Su runtime guarda las reglas compiladas
 * de Tailwind en un `let rules = {}` LOCAL al módulo (a diferencia de
 * styles/keyframes/rootVariables, que sí comparte vía `global.__css_interop`).
 * El CSS se inyectó en el `rules` de una copia y todos los `className` se
 * buscaron en el de la otra, vacío: la app se renderizó sin un solo estilo
 * —texto pegado a x=0, sin fondos, sin fuentes— y **sin lanzar una sola
 * excepción**, así que Sentry, el typecheck y los tests pasaron limpios. Se
 * detectó solo cuando un usuario mandó capturas.
 *
 * `StyleSheet` se importa de 'nativewind' a propósito: resuelve por la misma vía
 * que el runtime de JSX, o sea el lado *lector*. Si el CSS se inyecta en otra
 * copia, esta consulta devuelve undefined — que es justo lo que queremos cazar.
 *
 * El coste es una búsqueda en un objeto por cada clase, así que se puede llamar
 * en el arranque sin pensárselo.
 */
import { StyleSheet } from 'nativewind'

import { Sentry } from '@/lib/instrument'

/** Clases de las que dependen prácticamente todas las pantallas. */
const PROBES = ['flex-1', 'bg-background', 'text-foreground'] as const

/**
 * Devuelve true si NativeWind está operativo. Si no, reporta a Sentry y (en dev)
 * grita por consola. No lanza: una app sin estilos es fea, pero usable, y tirarla
 * al arranque sería peor.
 */
export function verifyStylesRegistered(): boolean {
  let missing: string[]
  try {
    missing = PROBES.filter((name) => !StyleSheet.getGlobalStyle(name))
  } catch (error) {
    Sentry.captureException(error, { tags: { selfcheck: 'nativewind' } })
    return false
  }

  if (missing.length === 0) return true

  const message = `NativeWind inerte: ${missing.length}/${PROBES.length} clases sin estilo (${missing.join(', ')})`
  if (__DEV__) {
    console.error(
      `${message}\n\nLa app se va a renderizar sin estilos. Causa habitual: dos copias ` +
        `de react-native-css-interop en el bundle.\nComprueba con: node scripts/preflight-mobile-release.mjs`,
    )
  }
  Sentry.captureMessage(message, {
    level: 'error',
    tags: { selfcheck: 'nativewind' },
    extra: { probes: PROBES, missing },
  })
  return false
}
