/**
 * Actividad sin terminar para el bloque «Hoy» (#858): junta las cuatro fuentes
 * del móvil en el `HomeActiveActivity` que espera `getHomeState` (#853).
 *
 * Prioridad cuando hay varias a la vez (pasa: un cardio con GPS mientras una
 * sesión de fuerza quedó a medias): batalla > cardio > circuito > fuerza o
 * sesión libre. Primero lo que corre en tiempo real con otra gente o con un
 * reloj en marcha; la sesión de fuerza aguanta pausada sin perder nada.
 *
 * Sin imports con `@/`: el Vitest del móvil no resuelve ese alias.
 */
import { toLocalDateStr } from '@calistenia/core/lib/dateUtils'
import type { HomeActiveActivity } from '@calistenia/core/lib/homeState'

export interface HomeActivitySources {
  /** Hay una batalla con gente dentro (`isBattleOngoing`). */
  battleOngoing: boolean
  /** `useCardioSessionContext()`: `state` y el día del programa si lo hay. */
  cardio: { state: string; programDayKey: string | null }
  /** `useCircuitSession()`. */
  circuit: { isActive: boolean; startedAt: number | null; programDayKey?: string | null }
  /** `useActiveSession()`: fuerza (programa) o sesión libre / primer entreno. */
  strength: { isActive: boolean; hasWorkout: boolean; source: string; startedAt: number; workoutKey: string }
}

function dayOf(ms: number | null | undefined): string | null {
  return typeof ms === 'number' && ms > 0 ? toLocalDateStr(new Date(ms)) : null
}

export function resolveHomeActiveActivity(s: HomeActivitySources): HomeActiveActivity | null {
  if (s.battleOngoing) return { type: 'battle' }
  if (s.cardio.state === 'tracking' || s.cardio.state === 'paused') {
    // Un cardio con GPS no cruza días en la práctica: sin `startedDay`, nunca
    // sale «la empezaste ayer».
    return { type: 'cardio', workoutKey: s.cardio.programDayKey }
  }
  if (s.circuit.isActive) {
    return { type: 'circuit', startedDay: dayOf(s.circuit.startedAt), workoutKey: s.circuit.programDayKey ?? null }
  }
  if (s.strength.isActive && s.strength.hasWorkout) {
    const free = s.strength.source !== 'program'
    return {
      type: free ? 'free' : 'strength',
      startedDay: dayOf(s.strength.startedAt),
      workoutKey: free ? null : s.strength.workoutKey,
    }
  }
  return null
}

/**
 * Ruta de la pestaña Hoy tal como la devuelve `usePathname()`. Las barras
 * flotantes no salen aquí: el bloque «Hoy» ya enseña «Continuar». Si #859
 * mueve Hoy de ruta, se cambia aquí (y en `ACTIVE_BATTLE_POLL_PATHS`).
 */
export const HOME_TAB_PATH = '/'

export function isHomeTabPath(pathname: string | null | undefined): boolean {
  return pathname === HOME_TAB_PATH
}
