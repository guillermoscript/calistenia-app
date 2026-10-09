/**
 * Actividad sin terminar para el bloque «Hoy»: junta las cuatro fuentes de
 * cada plataforma (batalla, fuerza/sesión libre, cardio y circuito) en el
 * `HomeActiveActivity` que espera `getHomeState`. Web y móvil la llaman con lo
 * que leen de sus contextos; antes cada una tenía su copia y no coincidían ni
 * en la prioridad.
 *
 * ## Qué gana cuando hay varias a la vez
 *
 * 1. **Batalla** (`lobby`/`ready`/`live`): hay otra gente esperando y dura
 *    minutos. Es lo único que se antepone a todo.
 * 2. Entre fuerza, cardio y circuito, **la que se empezó más tarde**. Varias
 *    vivas a la vez casi siempre es una que se quedó abierta (una sesión de
 *    fuerza a medias de ayer, un cardio pausado) y otra que el usuario acaba de
 *    arrancar: lo que está haciendo AHORA es lo último que empezó, y «Hoy» tiene
 *    que llevarle ahí. Un orden fijo por tipo enseñaba la vieja.
 * 3. Sin hora de inicio conocida cuenta como la más antigua; con la misma hora,
 *    cardio > circuito > fuerza (primero lo que tiene un reloj en marcha).
 *
 * `workoutKey` solo va cuando es un día del programa (`p{fase}_{día}`): la
 * sesión libre lleva `null` aunque tenga su propia clave `free_…`.
 */
import { toLocalDateStr } from './dateUtils'
import type { HomeActiveActivity } from './homeState'

export interface HomeActivitySources {
  /** Hay una batalla con gente dentro (`isBattleOngoing`). */
  battleOngoing: boolean
  /** Sesión de fuerza (programa) o libre / primer entreno: `useActiveSession()`. */
  strength: {
    isActive: boolean
    /** Hay entreno cargado: una sesión activa sin él no se puede continuar. */
    hasWorkout: boolean
    /** `SessionSource`: `'program'` o `'free'`. */
    source: string
    startedAt: number | null | undefined
    workoutKey: string | null | undefined
  }
  /** `useCardioSessionContext()`. */
  cardio: { state: string; startedAt: number | null | undefined; programDayKey: string | null | undefined }
  /** `useCircuitSession()`. */
  circuit: {
    isActive: boolean
    /** Hay circuito cargado (`circuit.circuit`). */
    hasCircuit: boolean
    startedAt: number | null | undefined
    programDayKey: string | null | undefined
  }
}

function validMs(ms: number | null | undefined): number | null {
  return typeof ms === 'number' && Number.isFinite(ms) && ms > 0 ? ms : null
}

function dayOf(ms: number | null): string | null {
  return ms === null ? null : toLocalDateStr(new Date(ms))
}

export function resolveHomeActiveActivity(s: HomeActivitySources): HomeActiveActivity | null {
  if (s.battleOngoing) return { type: 'battle', startedDay: null, workoutKey: null }

  // En orden de desempate: con la misma hora gana la primera.
  const candidates: Array<{ startedAt: number | null; activity: HomeActiveActivity }> = []

  if (s.cardio.state === 'tracking' || s.cardio.state === 'paused') {
    const startedAt = validMs(s.cardio.startedAt)
    candidates.push({
      startedAt,
      activity: { type: 'cardio', startedDay: dayOf(startedAt), workoutKey: s.cardio.programDayKey ?? null },
    })
  }
  if (s.circuit.isActive && s.circuit.hasCircuit) {
    const startedAt = validMs(s.circuit.startedAt)
    candidates.push({
      startedAt,
      activity: { type: 'circuit', startedDay: dayOf(startedAt), workoutKey: s.circuit.programDayKey ?? null },
    })
  }
  if (s.strength.isActive && s.strength.hasWorkout) {
    const startedAt = validMs(s.strength.startedAt)
    const free = s.strength.source !== 'program'
    candidates.push({
      startedAt,
      activity: {
        type: free ? 'free' : 'strength',
        startedDay: dayOf(startedAt),
        workoutKey: free ? null : (s.strength.workoutKey || null),
      },
    })
  }

  let best: (typeof candidates)[number] | null = null
  for (const c of candidates) {
    if (!best || (c.startedAt ?? -Infinity) > (best.startedAt ?? -Infinity)) best = c
  }
  return best?.activity ?? null
}
