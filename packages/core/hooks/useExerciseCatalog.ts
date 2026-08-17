/**
 * Catálogo de ejercicios (id → nombre y músculos) para las vistas de detalle (#473).
 *
 * Antes había dos copias de esto: `apps/web/src/hooks/useExerciseCatalog.ts` y
 * un `useEffect` dentro de `apps/mobile/src/app/session-detail.tsx`. Divergían
 * en algo que se notaba: móvil fusionaba `exercise-catalog.json` con
 * `WORKOUTS`, mientras web solo miraba `WORKOUTS`, así que en web había
 * ejercicios que se pintaban con su id crudo. Aquí se fusionan los dos.
 *
 * También cambia el tope: `getList(1, 200)` truncaba el catálogo en silencio, y
 * a partir de ahí las sesiones libres perdían los nombres. Ahora `getFullList`
 * con los campos proyectados, que es lo único que estas vistas necesitan.
 */

import { useQuery } from '@tanstack/react-query'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'
import { WORKOUTS } from '../data/workouts'
import catalogData from '../data/exercise-catalog.json'
import { catalogExerciseIdentity } from '../lib/exerciseCatalog'
import type { TranslatableField } from '../lib/i18n-db'

export type ExerciseCatalog = Record<string, { name: TranslatableField; muscles: TranslatableField }>

interface CatalogFileShape {
  categories: Record<
    string,
    { exercises: { id: string; name: TranslatableField; muscles: TranslatableField }[] }
  >
}

/**
 * Catálogo que viaja en el bundle. Se construye una sola vez al evaluar el
 * módulo y es el suelo del que nunca se baja: si PB no está disponible, esto es
 * lo que se pinta.
 *
 * Precedencia: el primero en entrar gana. El JSON del catálogo va antes que
 * `WORKOUTS` porque sus nombres son los canónicos.
 */
function buildStaticCatalog(): ExerciseCatalog {
  const catalog: ExerciseCatalog = {}

  const data = catalogData as unknown as CatalogFileShape
  Object.values(data.categories).forEach(category => {
    category.exercises.forEach(ex => {
      if (!catalog[ex.id]) catalog[ex.id] = { name: ex.name, muscles: ex.muscles }
    })
  })

  Object.values(WORKOUTS).forEach(workout => {
    workout.exercises.forEach(ex => {
      if (!catalog[ex.id]) catalog[ex.id] = { name: ex.name, muscles: ex.muscles }
    })
  })

  return catalog
}

export const STATIC_CATALOG: ExerciseCatalog = buildStaticCatalog()

/**
 * Catálogo estático más los ejercicios de `exercises_catalog` en PB, que son los
 * que necesitan las sesiones libres (sus ejercicios no están en ningún programa).
 *
 * Nunca falla hacia arriba: si PB no responde, devuelve el estático.
 */
export function useExerciseCatalog(): ExerciseCatalog {
  const query = useQuery({
    queryKey: qk.exerciseCatalog,
    // El catálogo cambia muy poco y lo consultan varias pantallas: media hora de
    // frescura evita repetir la lista completa al navegar entre detalles.
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<ExerciseCatalog> => {
      if (!(await isPocketBaseAvailable())) return STATIC_CATALOG

      const items = await pb.collection('exercises_catalog').getFullList({
        // `slug` hace falta para la identidad canónica (#474): sin él, la
        // proyección obligaba a indexar por el `id` aleatorio de PB.
        fields: 'id,slug,name,muscles',
        $autoCancel: false,
      })

      const merged: ExerciseCatalog = { ...STATIC_CATALOG }
      items.forEach(item => {
        // Se indexa por la identidad canónica (slug primero), no por el `id`
        // aleatorio de PocketBase: las claves de lo estático son ids canónicos,
        // así que con `item.id` las entradas de PB quedaban inalcanzables para
        // quien buscase por el id con el que se registran las series (#474).
        const key = catalogExerciseIdentity(item)
        // No pisa lo estático: los nombres del bundle están revisados y
        // traducidos, los de PB pueden venir a medias.
        if (key && !merged[key]) {
          merged[key] = {
            name: (item.name as TranslatableField) ?? key,
            muscles: (item.muscles as TranslatableField) ?? '',
          }
        }
      })
      return merged
    },
  })

  return query.data ?? STATIC_CATALOG
}
