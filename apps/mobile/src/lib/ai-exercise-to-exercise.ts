/**
 * Resuelve un ejercicio devuelto por el coach IA (`create_session`) contra el
 * catálogo local y lo convierte en `Exercise`, aplicando los sets/reps/rest que
 * eligió la IA y la fase (`section`) que el engine usa para los bloques
 * warmup → main → cooldown (SessionView lee `exercise.section`).
 *
 * Los IDs de la IA salen del mismo `exercise-catalog.json` que alimenta
 * `@/lib/catalog`, así que la resolución es directa; un ID desconocido devuelve
 * null y se descarta en el preview.
 */
import type { Exercise } from '@calistenia/core/types'
import { getCatalogExercise } from '@/lib/catalog'
import { catalogToExercise } from '@/lib/catalog-to-exercise'

export interface AIExercise {
  id: string
  sets: number
  reps: string
  rest: number
  phase?: 'warmup' | 'main' | 'cooldown'
}

/** Output de la tool `create_session` del backend. */
export interface CreateSessionResult {
  success: boolean
  exercises: AIExercise[]
  exercise_count: number
  format?: string
  invalid_ids?: string[]
}

export function aiExerciseToExercise(ai: AIExercise, locale: string): Exercise | null {
  const c = getCatalogExercise(ai.id)
  if (!c) return null
  return {
    ...catalogToExercise(c, locale),
    sets: ai.sets,
    reps: ai.reps,
    rest: ai.rest,
    section: ai.phase || 'main',
  }
}
