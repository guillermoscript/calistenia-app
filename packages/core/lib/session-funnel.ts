/**
 * Propiedades comunes a los eventos del ciclo de vida de una sesión de fuerza
 * (#636).
 *
 * Los cuatro eventos del embudo —arranque, completada, salida deliberada y
 * abandono— se emitían desde tres módulos distintos y con propiedades
 * distintas: `session_started` mandaba `{workout_key, source}`,
 * `workout_completed` mandaba `{workout_key, is_free_session}` y
 * `workout_abandoned` añadía `duration_seconds`. Sin un bloque común no se
 * puede segmentar el embudo por programa, por fase ni por plataforma, que es
 * justo lo que el issue pide poder hacer.
 *
 * Es un módulo aparte y sin React a propósito: así el bloque se puede afirmar
 * en un test sin montar un provider, y `useProgressMutations` puede usar el
 * mismo sin depender del contexto de la sesión activa.
 *
 * **Privacidad (§6 del #636):** aquí no entra nada libre ni identificable —
 * ni notas, ni nombres, ni correos, ni coordenadas. `workout_key` es una clave
 * de programa (`p2_mie`) o un timestamp (`free_1783…`).
 */
import { analyticsPlatform, getAnalyticsProgramId } from './analytics'
import { NO_PHASE, sessionKeyParts } from './session-key'

/**
 * Los cuatro desenlaces posibles de una sesión. Nombres legacy:
 * `session_started`, `workout_completed` y `workout_abandoned` ya están en
 * producción y renombrarlos partiría los informes existentes sin ganar nada.
 * `session_exited` es nuevo.
 */
export const TRAINING_FUNNEL_EVENTS = {
  sessionStarted: 'session_started',
  workoutCompleted: 'workout_completed',
  /** El usuario cerró la sesión a propósito sin completarla (#636). */
  sessionExited: 'session_exited',
  workoutAbandoned: 'workout_abandoned',
} as const

export type TrainingFunnelEvent = typeof TRAINING_FUNNEL_EVENTS[keyof typeof TRAINING_FUNNEL_EVENTS]

/**
 * Por qué se dio por abandonada la sesión. Sin esto las tres causas se mezclan
 * en un único número que no dice nada: cerrar la pestaña a media serie no es lo
 * mismo que una sesión que caducó a las 24 h ni que una reemplazada por otra.
 */
export type SessionAbandonReason = 'page_closed' | 'expired' | 'replaced'

export interface SessionFunnelInput {
  workoutKey: string
  /** `program` | `free`, tal y como lo declara quien arrancó la sesión. */
  source: string
  /**
   * `programs` record id. `undefined` = tómalo del registro de analytics;
   * `null` = esta sesión no tiene programa y no hay que buscarlo.
   */
  programId?: string | null
  /** Para derivar `duration_seconds` cuando no viene ya calculada. */
  startedAt?: number
  endedAt?: number
  durationSeconds?: number
  exerciseCount?: number
  /** Series planificadas del entreno, para el porcentaje de avance. */
  plannedSets?: number
  setsLogged?: number
  reason?: SessionAbandonReason
}

/**
 * Series planificadas de un entreno.
 *
 * `sets` es `number | string` porque el catálogo admite valores como
 * «múltiples» o «intentos». Esos ejercicios no cuentan en vez de envenenar la
 * suma con un `NaN` que dejaría `completion_pct` en `NaN` para todo el entreno.
 */
export function plannedSetCount(exercises: readonly { sets: number | string }[]): number {
  return exercises.reduce((total, ex) => {
    const sets = typeof ex.sets === 'number' ? ex.sets : Number.parseInt(String(ex.sets), 10)
    return Number.isFinite(sets) && sets > 0 ? total + sets : total
  }, 0)
}

export function sessionFunnelProperties({
  workoutKey,
  source,
  programId,
  startedAt,
  endedAt,
  durationSeconds,
  exerciseCount,
  plannedSets,
  setsLogged,
  reason,
}: SessionFunnelInput): Record<string, unknown> {
  const { phase, day, isFree } = sessionKeyParts(workoutKey)

  const props: Record<string, unknown> = {
    event_version: 1,
    platform: analyticsPlatform(),
    surface: 'session',
    workout_key: workoutKey,
    source,
    // Se mantiene aunque `phase`/`day_id` ya lo impliquen: los informes que hoy
    // segmentan por esta propiedad son los que hay que no romper.
    is_free_session: isFree,
    day_id: day,
  }

  if (phase !== NO_PHASE) props.phase = phase

  const resolvedProgramId = programId === undefined ? getAnalyticsProgramId() : programId
  if (!isFree && resolvedProgramId) props.program_id = resolvedProgramId

  const duration = durationSeconds ?? (
    startedAt && endedAt ? Math.max(0, Math.round((endedAt - startedAt) / 1000)) : undefined
  )
  if (duration != null) props.duration_seconds = duration

  if (exerciseCount != null) props.exercise_count = exerciseCount
  if (setsLogged != null) props.sets_logged = setsLogged
  // Un entreno con series de más (repetir una serie) no puede dar 130 %: el
  // embudo lo leería como que la gente completa más de lo que hay.
  if (setsLogged != null && plannedSets) {
    props.completion_pct = Math.min(100, Math.round((setsLogged / plannedSets) * 100))
  }
  if (reason) props.reason = reason

  return props
}
