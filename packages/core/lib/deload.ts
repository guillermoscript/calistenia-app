/**
 * Semana de descarga (#716): la mitad de series en los ejercicios principales.
 *
 * Función pura sobre un `Workout` ya construido, igual que `programOverrides.ts`:
 * sin React, sin PocketBase, sin catálogo. Quién decide SI toca descargar es
 * `isDeloadWeek` (`programProgress.ts`); aquí solo se aplica.
 *
 * Qué se reduce y qué no:
 * - Solo los ejercicios de la parte principal (`section` ≠ warmup/cooldown) con
 *   `priority` alta o media: el calentamiento y la vuelta a la calma son 1
 *   serie y reducirlos no descansa nada; los accesorios (`low`) ya son poco
 *   volumen y son lo primero que un entrenador quita entero, no a la mitad.
 * - `ceil(sets/2)`: 3 → 2, 4 → 2, 5 → 3. Una serie sigue siendo una.
 * - `sets` en texto («múltiples», «intentos») se deja tal cual: no hay número
 *   que partir y el texto ya describe un trabajo abierto.
 *
 * Reps, tiempos y descansos no cambian: la descarga clásica es MENOS volumen a
 * la MISMA intensidad, no una sesión más fácil por serie.
 */

import type { Exercise, Workout } from '../types'

/** `sets` reducido para la descarga; deja en paz los que no son número ≥ 2. */
export function deloadSets(sets: Exercise['sets']): Exercise['sets'] {
  if (typeof sets !== 'number' || !Number.isFinite(sets) || sets < 2) return sets
  return Math.ceil(sets / 2)
}

/** ¿Este ejercicio entra en la reducción? Principal, alta o media prioridad. */
export function isDeloadTarget(exercise: Exercise): boolean {
  if (exercise.section === 'warmup' || exercise.section === 'cooldown') return false
  return exercise.priority === 'high' || exercise.priority === 'med'
}

/**
 * El mismo `Workout` con las series de descarga y `deload: true`. Devuelve un
 * objeto NUEVO siempre (aunque no haya nada que partir): el flag es lo que
 * enciende el badge, y hace falta también en una sesión sin series numéricas.
 */
export function applyDeload(workout: Workout): Workout {
  return {
    ...workout,
    deload: true,
    exercises: workout.exercises.map(ex => {
      if (!isDeloadTarget(ex)) return ex
      const sets = deloadSets(ex.sets)
      return sets === ex.sets ? ex : { ...ex, sets }
    }),
  }
}
