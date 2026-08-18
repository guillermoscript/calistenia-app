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
import { getCatalogIndexSync, loadCatalogIndex } from '../lib/catalogIndex'
import { catalogExerciseIdentity } from '../lib/exerciseCatalog'
import { useCatalogIndex } from './useCatalogIndex'
import type { TranslatableField } from '../lib/i18n-db'

export type ExerciseCatalog = Record<string, { name: TranslatableField; muscles: TranslatableField }>

let _staticCatalog: ExerciseCatalog | null = null
let _staticCatalogHadIndex = false

/**
 * Catálogo que viaja en el bundle: el suelo del que nunca se baja, porque si PB
 * no está disponible es lo que se pinta.
 *
 * Precedencia: el primero en entrar gana. El catálogo de ejercicios va antes que
 * `WORKOUTS` porque sus nombres son los canónicos.
 *
 * Desde el #486 ya no se construye al evaluar el módulo: el catálogo se carga
 * perezosamente, así que esto se memoiza y se reconstruye una única vez más,
 * cuando el índice llega. Sin índice devuelve solo `WORKOUTS`, que es justo lo
 * que ya se pintaba antes para los ejercicios de programa.
 */
export function getStaticCatalog(): ExerciseCatalog {
  const index = getCatalogIndexSync()
  const hasIndex = index !== null
  if (_staticCatalog && _staticCatalogHadIndex === hasIndex) return _staticCatalog

  const catalog: ExerciseCatalog = {}

  for (const ex of index?.all ?? []) {
    if (!catalog[ex.id]) {
      catalog[ex.id] = {
        name: ex.name,
        muscles: (ex.muscles ?? '') as TranslatableField,
      }
    }
  }

  Object.values(WORKOUTS).forEach(workout => {
    workout.exercises.forEach(ex => {
      if (!catalog[ex.id]) catalog[ex.id] = { name: ex.name, muscles: ex.muscles }
    })
  })

  _staticCatalog = catalog
  _staticCatalogHadIndex = hasIndex
  return catalog
}

/**
 * Catálogo estático más los ejercicios de `exercises_catalog` en PB, que son los
 * que necesitan las sesiones libres (sus ejercicios no están en ningún programa).
 *
 * Nunca falla hacia arriba: si PB no responde, devuelve el estático.
 *
 * `useCatalogIndex()` es lo que hace que esto siga siendo correcto con el
 * catálogo perezoso (#486): re-renderiza cuando el índice llega, y hasta
 * entonces `catalogExerciseIdentity()` no se llama, porque la query espera al
 * índice antes de tocar PB.
 */
export function useExerciseCatalog(): ExerciseCatalog {
  // El hook guarda estado propio: cuando el índice llega, re-renderiza y
  // `getStaticCatalog()` se reconstruye ya con el catálogo. Sin él, una primera
  // pintada sin catálogo se quedaría con los nombres de `WORKOUTS` hasta que
  // algo ajeno provocase otro render.
  useCatalogIndex()
  const query = useQuery({
    queryKey: qk.exerciseCatalog,
    // El catálogo cambia muy poco y lo consultan varias pantallas: media hora de
    // frescura evita repetir la lista completa al navegar entre detalles.
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<ExerciseCatalog> => {
      // Antes de nada el índice: `catalogExerciseIdentity()` de más abajo lo
      // necesita para resolver el slug de PB al id canónico, y sin él caería a
      // «devuelve la entrada intacta» y las entradas de PB quedarían
      // inalcanzables para quien busque por el id de las series (#474).
      await loadCatalogIndex()
      if (!(await isPocketBaseAvailable())) return getStaticCatalog()

      const items = await pb.collection('exercises_catalog').getFullList({
        // `slug` hace falta para la identidad canónica (#474): sin él, la
        // proyección obligaba a indexar por el `id` aleatorio de PB.
        fields: 'id,slug,name,muscles',
        $autoCancel: false,
      })

      const merged: ExerciseCatalog = { ...getStaticCatalog() }
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

  return query.data ?? getStaticCatalog()
}
