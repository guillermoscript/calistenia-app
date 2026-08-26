/**
 * programOverrides — lo que el usuario ha aceptado sobre un programa que NO es
 * suyo, superpuesto a lo prescrito (#617).
 *
 * En un programa propio, aceptar una progresión escribe en `program_exercises`
 * y aquí no hay nada que hacer. En uno ajeno —los 15 oficiales, o el de otra
 * persona— escribir ahí sería cambiarle el programa a todo el mundo, así que la
 * aceptación vive en `user_program_overrides` y es el cliente quien la
 * superpone al montar el día.
 *
 * Función pura sobre el `WorkoutsMap` ya construido, en la línea de
 * `programProgress.ts`: sin React, sin PocketBase y sin catálogo. El nombre del
 * ejercicio sustituto entra resuelto desde fuera, porque resolverlo requiere el
 * índice del catálogo y eso ataría este módulo al JSON.
 *
 * Decisiones que fija este módulo:
 *
 * - **Se identifica por la clave de slot, no por el ejercicio.** `exercise_id`
 *   es el id con el que el programa nombra ese hueco del día (`lun_1_2`), que es
 *   justo lo que no cambia cuando el usuario sustituye la variante. Si la clave
 *   fuese el ejercicio, el primer cambio de variante desconectaría el override
 *   de su propio hueco.
 * - **Un override que no casa con ningún hueco se ignora en silencio.** El autor
 *   puede haber reordenado o borrado el ejercicio; la fila sobra, pero no puede
 *   tumbar el día entero.
 * - **Devuelve la MISMA referencia si no cambia nada.** Igual que las funciones
 *   de copia del editor (#621): así el `useMemo` de quien lo llama no invalida
 *   media app por un usuario que no ha aceptado nada nunca, que es el caso
 *   normal.
 */
import type { Exercise, WorkoutsMap } from '../types'

/** Fila de `user_program_overrides` ya mapeada. */
export interface ProgramOverride {
  exerciseId: string
  /** Variante aceptada. Vacío = solo cambió la dosis. */
  exerciseIdOverride?: string
  /** Dosis aceptada. En temporizador son SEGUNDOS, como en toda la app. */
  repsOverride?: string
  /** Nombre ya localizado de la variante; solo hace falta si hay sustitución. */
  exerciseNameOverride?: string
}

/** Índice por `exerciseId`, que es como se buscan al recorrer el día. */
export function indexOverrides(overrides: ProgramOverride[]): Map<string, ProgramOverride> {
  const map = new Map<string, ProgramOverride>()
  for (const o of overrides ?? []) {
    if (o?.exerciseId) map.set(o.exerciseId, o)
  }
  return map
}

/**
 * Un ejercicio con su override aplicado, o **la misma referencia** si no le
 * toca ninguno.
 *
 * El `id` NO se toca aunque cambie la variante: es la clave del hueco, y con
 * ella se escriben las series (`sets_log`) y se vuelve a encontrar el override
 * la próxima vez. Lo que cambia es qué ejercicio se hace en ese hueco, y eso
 * viaja en `variant_of` + el nombre, que es lo que pinta la UI.
 */
export function applyOverrideToExercise(
  exercise: Exercise,
  override: ProgramOverride | undefined,
): Exercise {
  if (!override) return exercise

  const reps = override.repsOverride
  const variantId = override.exerciseIdOverride
  const changesReps = !!reps && reps !== exercise.reps
  const changesVariant = !!variantId && variantId !== exercise.variant_of

  if (!changesReps && !changesVariant) return exercise

  const next: Exercise = { ...exercise }
  if (changesReps) {
    next.reps = reps!
    // En temporizador la dosis vive TAMBIÉN en `timerSeconds`, que es de donde
    // la cuenta atrás saca su valor: actualizar solo `reps` dejaría el chip
    // diciendo 35 s y el cronómetro contando 30.
    if (exercise.isTimer) {
      const secs = Number(String(reps).match(/\d+/)?.[0])
      if (Number.isFinite(secs) && secs > 0) next.timerSeconds = secs
    }
  }
  if (changesVariant) {
    next.variant_of = variantId
    if (override.exerciseNameOverride) next.name = override.exerciseNameOverride
  }
  return next
}

/**
 * El mapa de entrenamientos con los overrides del usuario aplicados.
 *
 * Sin overrides —o sin ninguno que case— devuelve el mapa de entrada tal cual.
 */
export function applyOverrides(
  workouts: WorkoutsMap,
  overrides: ProgramOverride[],
): WorkoutsMap {
  if (!overrides?.length) return workouts
  const byId = indexOverrides(overrides)
  if (byId.size === 0) return workouts

  let mapChanged = false
  const out: WorkoutsMap = {}

  for (const [key, workout] of Object.entries(workouts ?? {})) {
    let listChanged = false
    const exercises = (workout.exercises ?? []).map(ex => {
      const next = applyOverrideToExercise(ex, byId.get(ex.id))
      if (next !== ex) listChanged = true
      return next
    })
    if (listChanged) {
      mapChanged = true
      out[key] = { ...workout, exercises }
    } else {
      out[key] = workout
    }
  }

  return mapChanged ? out : workouts
}
