/**
 * Lógica pura de la vista de rutina compartida (#473).
 *
 * `RoutineViewPage` armaba el join fases × días × ejercicios dentro del propio
 * `useEffect` de carga, con un `filter` por fase dentro de un `map` sobre las
 * fases — O(fases × ejercicios) y con `any` en cada callback. Aquí se hace con
 * un índice por `phase_number`, en O(n), y con las filas tipadas.
 *
 * Los textos salen crudos (`TranslatableField`): localizarlos aquí es lo que
 * metía `l` en las dependencias del efecto y hacía que cambiar de idioma
 * relanzara las cuatro consultas.
 */

import type { TranslatableField } from './i18n-db'

/** Fila de `program_phases`. */
export interface RoutinePhaseRow {
  id: string
  phase_number: number
  name: TranslatableField
  weeks: number
  color: string
  bg_color: string
  sort_order: number
}

/** Fila de `program_exercises`. */
export interface RoutineExerciseRow {
  id: string
  phase_number: number
  day_id: string
  day_type: string
  day_name: TranslatableField
  day_focus: TranslatableField
  day_color: string
  workout_title: TranslatableField
  exercise_id: string
  exercise_name: TranslatableField
  sets: number
  reps: string
  rest_seconds: number
  muscles: TranslatableField
  note: TranslatableField
  youtube: string
  priority: number
  is_timer: boolean
  timer_seconds: number
  sort_order: number
}

export interface RoutineDayGroup {
  day_id: string
  day_name: TranslatableField
  day_focus: TranslatableField
  day_color: string
  exercises: RoutineExerciseRow[]
}

export interface RoutinePhaseGroup {
  phase: RoutinePhaseRow
  days: RoutineDayGroup[]
}

/**
 * Agrupa los ejercicios de un programa por fase y, dentro de cada fase, por día.
 *
 * Indexa una sola vez por `phase_number` en lugar de recorrer la lista completa
 * de ejercicios por cada fase. El orden dentro de cada día es el de llegada, así
 * que quien consulte debe pedir `sort: 'phase_number,sort_order'`.
 *
 * Los datos del día (`day_name`, `day_focus`, `day_color`) se toman del primer
 * ejercicio de ese día: están desnormalizados en cada fila de
 * `program_exercises` y todas las de un mismo día los repiten.
 */
export function buildPhaseGroups(
  phases: RoutinePhaseRow[],
  exercises: RoutineExerciseRow[],
): RoutinePhaseGroup[] {
  const byPhase = new Map<number, RoutineExerciseRow[]>()
  for (const ex of exercises) {
    const bucket = byPhase.get(ex.phase_number)
    if (bucket) bucket.push(ex)
    else byPhase.set(ex.phase_number, [ex])
  }

  return phases.map(phase => {
    const dayMap = new Map<string, RoutineDayGroup>()
    for (const ex of byPhase.get(phase.phase_number) ?? []) {
      let day = dayMap.get(ex.day_id)
      if (!day) {
        day = {
          day_id: ex.day_id,
          day_name: ex.day_name,
          day_focus: ex.day_focus,
          day_color: ex.day_color,
          exercises: [],
        }
        dayMap.set(ex.day_id, day)
      }
      day.exercises.push(ex)
    }
    return { phase, days: Array.from(dayMap.values()) }
  })
}
