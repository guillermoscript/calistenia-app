/**
 * Catálogo de ejercicios aplanado desde core/data/exercise-catalog.json
 * (mismo shape que usa la web en ExerciseLibraryPage).
 */
import catalogData from '@calistenia/core/data/exercise-catalog.json'
import type { TranslatableField } from '@calistenia/core/lib/i18n-db'
import type { Priority, DifficultyLevel } from '@calistenia/core/types'

export interface CatalogExercise {
  id: string
  name: TranslatableField
  muscles: TranslatableField
  category: string
  priority: Priority
  sets: number | string
  reps: string
  rest: number
  note: TranslatableField
  description?: TranslatableField
  isTimer?: boolean
  timerSeconds?: number
  difficulty?: DifficultyLevel
  equipment?: string[]
  muscle_groups?: string[]
  youtube_query?: string
  youtube_search?: string
}

interface CatalogShape {
  categories: Record<string, { count: number; exercises: CatalogExercise[] }>
}

const data = catalogData as unknown as CatalogShape

export const CATALOG_CATEGORIES: string[] = Object.keys(data.categories)

export const CATALOG: CatalogExercise[] = CATALOG_CATEGORIES.flatMap(cat =>
  data.categories[cat].exercises.map(ex => ({ ...ex, category: ex.category || cat }))
)

const byId = new Map(CATALOG.map(ex => [ex.id, ex]))

export function getCatalogExercise(id: string): CatalogExercise | undefined {
  return byId.get(id)
}
