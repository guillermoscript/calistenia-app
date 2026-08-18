/**
 * Catálogo de ejercicios aplanado desde core/data/exercise-catalog.json
 * (mismo shape que usa la web en ExerciseLibraryPage).
 *
 * Desde el #486 el aplanado y los índices los hace `core/lib/catalogIndex`, que
 * es el único módulo que recorre el fichero. Aquí sólo se prima ese índice: en
 * React Native el JSON viaja en el bundle de todas formas, así que no hay nada
 * que ahorrar cargándolo tarde, y las APIs síncronas de core (`resolveExerciseId`,
 * `getCatalogEntry`, `getCatalogStaticMedia`) responden desde el arranque.
 */
import catalogData from '@calistenia/core/data/exercise-catalog.json'
import { primeCatalogIndex, type RawCatalog } from '@calistenia/core/lib/catalogIndex'
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

const index = primeCatalogIndex(catalogData as unknown as RawCatalog)

export const CATALOG_CATEGORIES: string[] = index.categories

/**
 * Lista plana con la categoría rellenada desde la clave del fichero cuando la
 * entrada no la trae. Es una vista sobre el índice compartido: se construye una
 * vez y no vuelve a recorrer el catálogo.
 */
export const CATALOG: CatalogExercise[] = CATALOG_CATEGORIES.flatMap(cat =>
  (index.raw.categories[cat]?.exercises ?? []).map(ex => ({
    ...ex,
    category: (ex.category || cat) as string,
  })) as unknown as CatalogExercise[]
)

export function getCatalogExercise(id: string): CatalogExercise | undefined {
  return index.byId.get(id) as CatalogExercise | undefined
}
