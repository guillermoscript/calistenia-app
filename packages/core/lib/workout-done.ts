/**
 * Entreno terminado que el servidor RECHAZÓ.
 *
 * `markWorkoutDone` pinta el entreno como hecho al instante (optimista) y lo
 * escribe después. Los fallos de red y los transitorios del servidor acaban en
 * la cola offline y se reintentan; este error es lo que queda: un rechazo
 * determinista (400 de validación, 403 de regla…) que ningún reintento va a
 * arreglar. Cuando se lanza, el optimista ya se ha deshecho y el fallo ya se ha
 * reportado: al llamador solo le toca decírselo al usuario. Sin esto, la
 * celebración decía «hecho» y el siguiente refetch borraba el entreno en
 * silencio.
 */
import type { ProgressMap, SessionDone } from '../types'

export class WorkoutNotSavedError extends Error {
  readonly workoutKey: string
  /** Status HTTP del rechazo, si lo hubo. */
  readonly status: number | null

  constructor(workoutKey: string, cause: unknown) {
    super(`Workout ${workoutKey} was rejected by the server`, { cause })
    this.name = 'WorkoutNotSavedError'
    this.workoutKey = workoutKey
    const status = (cause as { status?: unknown } | null)?.status
    this.status = typeof status === 'number' ? status : null
  }
}

export function isWorkoutNotSavedError(e: unknown): e is WorkoutNotSavedError {
  return e instanceof WorkoutNotSavedError
    || (!!e && typeof e === 'object' && (e as { name?: unknown }).name === 'WorkoutNotSavedError')
}

/**
 * Quita UNA marca de entreno hecho de `done_<fecha>_<workoutKey>`.
 *
 * Repetir el mismo entreno el mismo día reusa la clave y suma `count`: quitar
 * una resta uno y solo borra la clave al llegar a cero. Lo usan deshacer el
 * entreno a mano y revertir el optimista de un entreno rechazado, que tienen
 * que dejar el progreso exactamente igual.
 */
export function removeOneWorkoutDone(prev: ProgressMap, doneKey: string): ProgressMap {
  const next = { ...prev }
  const entry = next[doneKey] as SessionDone | undefined
  if (entry?.done && (entry.count ?? 1) > 1) {
    next[doneKey] = { ...entry, count: (entry.count ?? 1) - 1 }
  } else {
    delete next[doneKey]
  }
  return next
}
