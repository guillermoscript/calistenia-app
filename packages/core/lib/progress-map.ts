import { utcToLocalDateStr } from './dateUtils'
import { getQueue } from './offlineQueue'
import type { ProgressMap, ExerciseLog, ExerciseTiming, SessionDone } from '../types'

/** Fila de `sessions` (registro de PocketBase o payload aún encolado). */
export interface ProgressSessionRow {
  workout_key: string
  completed_at?: string
  created?: string
  note?: string
  warmup_skipped?: boolean
  warmup_completed?: boolean
  warmup_duration_seconds?: number
  cooldown_skipped?: boolean
  cooldown_completed?: boolean
  cooldown_duration_seconds?: number
  duration_seconds?: number | null
  poses_completed?: number | null
  total_poses?: number | null
  exercise_timings?: ExerciseTiming[]
  client_id?: string
}

/** Fila de `sets_log` (registro de PocketBase o payload aún encolado). */
export interface ProgressSetRow {
  exercise_id: string
  workout_key: string
  reps?: string
  note?: string
  weight_kg?: number | null
  rpe?: number | null
  logged_at?: string
  created?: string
  client_id?: string
}

/** Fila de `cardio_sessions` (solo los campos que pide `loadFromPB`). */
export interface ProgressCardioRow {
  id: string
  program_day_key?: string
  started_at?: string
  created?: string
  note?: string
}

/** Fila de `circuit_sessions` (solo los campos que pide `loadFromPB`). */
export interface ProgressCircuitRow {
  id: string
  program_day_key?: string
  started_at?: string
  created?: string
  note?: string
}

/**
 * Marcador de "día hecho" que deriva de un circuito de programa.
 *
 * `circuitSessionId` es el gemelo de `cardioSessionId`: existe para que
 * `isWorkoutDone` marque el día del programa como completado mientras las
 * listas de historial/actividad/estadísticas lo ignoran (el circuito ya se
 * pinta por su cuenta). Vive aquí y no en `SessionDone` porque los tipos
 * compartidos son de otro dueño; cuando el campo se estabilice, moverlo allí es
 * una línea.
 */
export interface CircuitSessionDone extends SessionDone {
  circuitSessionId: string
}

/**
 * Reconstruye el `ProgressMap` a partir de las filas de `sessions`, `sets_log`,
 * `cardio_sessions` y `circuit_sessions`.
 *
 * Vive fuera del hook para poder recibir también los `create` que siguen en la
 * cola offline: su payload usa exactamente los mismos nombres de campo que el
 * registro de PocketBase (`workout_key`, `completed_at`, `exercise_id`,
 * `logged_at`…), así que basta con concatenarlos delante de lo del servidor. Sin
 * esto, `loadFromPB` sobrescribía la caché local con lo remoto y una sesión
 * entrenada sin cobertura desaparecía también del móvil (#301).
 *
 * Los tests de `packages/core` corren en vitest/node sin testing-library, así
 * que esta función es además el punto por el que se prueba la fusión.
 */
export function buildProgressMap(
  sessionRows: ProgressSessionRow[],
  setRows: ProgressSetRow[],
  cardioRows: ProgressCardioRow[],
  circuitRows: ProgressCircuitRow[] = [],
): ProgressMap {
  const prog: ProgressMap = {}

  sessionRows.forEach((s) => {
    const date = utcToLocalDateStr((s.completed_at || s.created)!)
    const entry: SessionDone = { done: true, date, workoutKey: s.workout_key, note: s.note || '' }
    if (s.warmup_skipped || s.warmup_completed || s.warmup_duration_seconds) {
      entry.warmupCompleted = !!s.warmup_completed
      entry.warmupSkipped = !!s.warmup_skipped
      entry.warmupDurationSeconds = s.warmup_duration_seconds || 0
    }
    if (s.cooldown_skipped || s.cooldown_completed || s.cooldown_duration_seconds) {
      entry.cooldownCompleted = !!s.cooldown_completed
      entry.cooldownSkipped = !!s.cooldown_skipped
      entry.cooldownDurationSeconds = s.cooldown_duration_seconds || 0
    }
    if (s.duration_seconds != null || s.poses_completed != null || s.total_poses != null) {
      entry.durationSeconds = s.duration_seconds ?? undefined
      entry.posesCompleted = s.poses_completed ?? undefined
      entry.totalPoses = s.total_poses ?? undefined
    }
    if (Array.isArray(s.exercise_timings) && s.exercise_timings.length > 0) {
      entry.exerciseTimings = s.exercise_timings
    }
    // Varias sesiones del mismo día+workout (repeticiones) comparten clave:
    // conservamos la más reciente (sort -completed_at) y acumulamos el conteo.
    const dk = `done_${date}_${s.workout_key}`
    const existing = prog[dk] as SessionDone | undefined
    if (existing?.done) {
      existing.count = (existing.count ?? 1) + 1
    } else {
      entry.count = 1
      prog[dk] = entry
    }
  })

  setRows.forEach((s) => {
    const date = utcToLocalDateStr((s.logged_at || s.created)!)
    const k = `${date}_${s.workout_key}_${s.exercise_id}`
    if (!prog[k]) prog[k] = { sets: [], date, workoutKey: s.workout_key, exerciseId: s.exercise_id }
    const entry = prog[k] as ExerciseLog
    entry.sets.push({
      reps: s.reps!,
      note: s.note!,
      weight: s.weight_kg || undefined,
      rpe: s.rpe || undefined,
      timestamp: new Date(s.logged_at || s.created!).getTime(),
    })
  })

  // Cardio vinculado a un día de programa → marcador "done_" etiquetado con
  // cardioSessionId. Hace que isWorkoutDone(p1_mie) sea true (checkmark del
  // programa) y sobrevive recargas porque se reconstruye desde cardio_sessions
  // igual que las sesiones de fuerza. Las listas/stats lo ignoran por la etiqueta.
  cardioRows.forEach((c) => {
    if (!c.program_day_key) return
    const date = utcToLocalDateStr((c.started_at || c.created)!)
    prog[`done_${date}_${c.program_day_key}`] = {
      done: true,
      date,
      workoutKey: c.program_day_key,
      note: c.note || '',
      completedAt: new Date(c.started_at || c.created!).getTime(),
      cardioSessionId: c.id,
    }
  })

  // Circuito vinculado a un día de programa → mismo marcador "done_", etiquetado
  // con circuitSessionId (#640). Sin esto, un circuito completado no ponía el
  // check del día ni podía contar para el hito de fase, y como el día de
  // circuito SÍ entra en `requiredDays`, el hito del programa entero quedaba
  // bloqueado para siempre.
  circuitRows.forEach((c) => {
    if (!c.program_day_key) return
    // A diferencia de cardio, `circuit_sessions.started_at` es texto libre y sin
    // `autodate` no hay `created` al que caer: sin fecha usable la clave saldría
    // como `done_Invalid Date_…` y ensuciaría el mapa para siempre.
    const at = c.started_at || c.created
    if (!at) return
    const date = utcToLocalDateStr(at)
    const dk = `done_${date}_${c.program_day_key}`
    // No pisar un marcador que ya exista para el mismo día+clave: el de
    // `sessions` lleva count, timings y notas, y ese sí alimenta estadísticas.
    if (prog[dk]) return
    const entry: CircuitSessionDone = {
      done: true,
      date,
      workoutKey: c.program_day_key,
      note: c.note || '',
      completedAt: new Date(at).getTime(),
      circuitSessionId: c.id,
    }
    prog[dk] = entry
  })

  return prog
}

/**
 * Descarta los payloads encolados que el servidor YA devolvió, comparando por
 * `client_id`.
 *
 * Es el caso de la ventana ciega: un create se encoló tras un `status: 0` pero
 * en realidad sí llegó. Hasta que la cola drene y descubra el
 * `validation_not_unique`, el item sigue encolado — y superponerlo sobre la fila
 * real del servidor pintaría la misma serie (o la misma sesión) dos veces.
 */
export function pendingNotYetOnServer<T extends { client_id?: string }>(
  pending: T[],
  serverRows: Array<{ client_id?: string }>,
): T[] {
  const seen = new Set(serverRows.map(r => r?.client_id).filter(Boolean))
  return pending.filter(p => !p?.client_id || !seen.has(p.client_id))
}

/**
 * Sesiones y series encoladas que hay que superponer a lo del servidor.
 *
 * Las dos salen de UNA sola lectura de la cola a propósito. `getQueue()` es un
 * `localStorage.getItem` + `JSON.parse` del blob entero, y pedirlo dos veces no
 * solo duplica ese coste: abre la puerta a que un drenado caiga entre ambas
 * llamadas y las sesiones se lean de un snapshot y las series de otro.
 *
 * Las sesiones aplican el mismo criterio que el `sessionFilter` de `loadFromPB`
 * (`user = uid && (program = pid || program = "")`); las series solo filtran por
 * usuario, porque `sets_log` no se scopea por programa.
 */
export function pendingProgressRows(
  uid: string,
  activeProgramId: string | null,
  serverSessions: Array<{ client_id?: string }>,
  serverSets: Array<{ client_id?: string }>,
): { sessions: ProgressSessionRow[]; sets: ProgressSetRow[] } {
  const queue = getQueue()
  const createsOf = (collection: string) =>
    queue.filter(a => a.collection === collection && a.action === 'create' && a.data).map(a => a.data)

  const sessions = createsOf('sessions').filter((d: any) => {
    if (d?.user !== uid) return false
    if (!activeProgramId) return true
    return !d.program || d.program === activeProgramId
  })
  const sets = createsOf('sets_log').filter((d: any) => d?.user === uid)

  return {
    sessions: pendingNotYetOnServer(sessions, serverSessions),
    sets: pendingNotYetOnServer(sets, serverSets),
  }
}
