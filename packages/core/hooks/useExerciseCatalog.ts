/**
 * Catálogo de ejercicios compartido: el bundle fusionado con `exercises_catalog`
 * de PocketBase, en una sola consulta y con una sola política de precedencia.
 *
 * Antes había dos copias de esto: `apps/web/src/hooks/useExerciseCatalog.ts` y
 * un `useEffect` dentro de `apps/mobile/src/app/session-detail.tsx`. Divergían
 * en algo que se notaba: móvil fusionaba `exercise-catalog.json` con
 * `WORKOUTS`, mientras web solo miraba `WORKOUTS`, así que en web había
 * ejercicios que se pintaban con su id crudo. Aquí se fusionan los dos (#473).
 *
 * También cambia el tope: `getList(1, 200)` truncaba el catálogo en silencio, y
 * a partir de ahí las sesiones libres perdían los nombres. Ahora `getFullList`.
 *
 * El #609 añade la otra mitad. Los dos pickers del editor de programas seguían
 * cada uno con su fuente —web leía PB y caía a `WORKOUTS`, móvil leía sólo el
 * JSON del bundle—, así que un ejercicio privado creado por el usuario no
 * existía para el móvil y los 1.578 del bundle no existían para la web si PB no
 * respondía. Un picker necesita más que el nombre (series, reps, descanso,
 * prioridad, categoría), y de eso va `useCatalogExerciseList()`:
 *
 *   useCatalogExerciseList()  →  CatalogExercise[]        (la consulta)
 *   useExerciseCatalog()      →  Record<id, {name,muscles}> (proyección de la anterior)
 *
 * Las dos comparten caché, así que las pantallas de detalle y los pickers ya no
 * pueden ver catálogos distintos: es literalmente la misma lista.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'
import { WORKOUTS } from '../data/workouts'
import { getCatalogIndexSync, loadCatalogIndex } from '../lib/catalogIndex'
import {
  mapCatalogIndexEntry,
  mapWorkoutExercise,
  mergeCatalogRecords,
  type CatalogExercise,
} from '../lib/exerciseCatalog'
import { useCatalogIndex } from './useCatalogIndex'
import type { TranslatableField } from '../lib/i18n-db'

export type ExerciseCatalog = Record<string, { name: TranslatableField; muscles: TranslatableField }>

let _staticList: CatalogExercise[] | null = null
let _staticListHadIndex = false

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
export function getStaticCatalogList(): CatalogExercise[] {
  const index = getCatalogIndexSync()
  const hasIndex = index !== null
  if (_staticList && _staticListHadIndex === hasIndex) return _staticList

  const bySlug = new Map<string, CatalogExercise>()

  // Se recorre por categoría (y no `index.all`) para poder rellenar la categoría
  // desde la clave del fichero cuando la entrada no la trae, que es lo que hacía
  // `apps/mobile/src/lib/catalog.ts`.
  for (const category of index?.categories ?? []) {
    for (const entry of index?.raw.categories[category]?.exercises ?? []) {
      if (!bySlug.has(entry.id)) bySlug.set(entry.id, mapCatalogIndexEntry(entry, category))
    }
  }

  Object.values(WORKOUTS).forEach(workout => {
    workout.exercises.forEach(ex => {
      if (!bySlug.has(ex.id)) bySlug.set(ex.id, mapWorkoutExercise(ex))
    })
  })

  _staticList = [...bySlug.values()]
  _staticListHadIndex = hasIndex
  return _staticList
}

/** La misma base estática, proyectada a `id → {name, muscles}`. */
export function getStaticCatalog(): ExerciseCatalog {
  return toNameCatalog(getStaticCatalogList())
}

function toNameCatalog(list: CatalogExercise[]): ExerciseCatalog {
  const catalog: ExerciseCatalog = {}
  for (const ex of list) {
    if (!catalog[ex.slug]) catalog[ex.slug] = { name: ex.name, muscles: ex.muscles ?? '' }
  }
  return catalog
}

export interface UseCatalogExerciseListResult {
  /** Bundle + `WORKOUTS` + lo que sólo existe en PB (privados, promovidos, yoga). */
  exercises: CatalogExercise[]
  /** `true` mientras la consulta a PB no ha resuelto; `exercises` ya trae el bundle. */
  loading: boolean
}

/**
 * La lista completa del catálogo, con todos los campos que necesita un picker.
 *
 * Nunca falla hacia arriba: si PB no responde, devuelve la base estática. Y
 * nunca espera a la red para tener algo que pintar — en React Native el índice
 * viene primado desde `init-core.ts`, así que la primera pintada ya trae los
 * 1.578 del bundle.
 *
 * PB **no pisa** al bundle: los nombres y notas del bundle están revisados y
 * traducidos, los de PB pueden venir a medias. Lo que aporta PB es lo que sólo
 * existe allí: los ejercicios privados del usuario, los promovidos y el yoga
 * (que entró por migración y no está en el JSON empaquetado).
 *
 * `useCatalogIndex()` es lo que hace que esto siga siendo correcto con el
 * catálogo perezoso (#486): re-renderiza cuando el índice llega, y hasta
 * entonces `catalogExerciseIdentity()` no se llama, porque la query espera al
 * índice antes de tocar PB.
 */
export function useCatalogExerciseList(): UseCatalogExerciseListResult {
  // El hook guarda estado propio: cuando el índice llega, re-renderiza y
  // `getStaticCatalogList()` se reconstruye ya con el catálogo. Sin él, una
  // primera pintada sin catálogo se quedaría con los ejercicios de `WORKOUTS`
  // hasta que algo ajeno provocase otro render.
  useCatalogIndex()
  const query = useQuery({
    queryKey: qk.exerciseCatalog,
    // El catálogo cambia muy poco y lo consultan varias pantallas: media hora de
    // frescura evita repetir la lista completa al navegar entre detalles.
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<CatalogExercise[]> => {
      // Antes de nada el índice: `catalogExerciseIdentity()` de más abajo lo
      // necesita para resolver el slug de PB al id canónico, y sin él caería a
      // «devuelve la entrada intacta» y las entradas de PB quedarían
      // inalcanzables para quien busque por el id de las series (#474).
      await loadCatalogIndex()
      if (!(await isPocketBaseAvailable())) return getStaticCatalogList()

      // Sin proyección `fields:` a propósito. `mapCatalogRecord()` necesita casi
      // todas las columnas de la colección, así que recortar no ahorraría nada y
      // sí reintroduciría la trampa del #474: un auto-merge deja fuera un campo
      // de la lista y lo que se pierde no da error, sólo desaparece del picker.
      const items = await pb.collection('exercises_catalog').getFullList({
        batch: 500,
        $autoCancel: false,
      })

      // La fusión indexa por identidad canónica (slug primero), no por el `id`
      // aleatorio de PocketBase: las claves de lo estático son ids canónicos,
      // así que con `item.id` las entradas de PB quedaban inalcanzables para
      // quien buscase por el id con el que se registran las series (#474).
      return mergeCatalogRecords(getStaticCatalogList(), items)
    },
  })

  return {
    exercises: query.data ?? getStaticCatalogList(),
    loading: query.isPending,
  }
}

/**
 * Catálogo de nombres (`id → {name, muscles}`) para las vistas de detalle, que
 * sólo necesitan poner nombre a una serie ya registrada.
 *
 * Es una proyección de `useCatalogExerciseList()`, no una consulta propia: son
 * la misma colección y tenerlas separadas era lo que dejaba que divergiesen.
 */
export function useExerciseCatalog(): ExerciseCatalog {
  const { exercises } = useCatalogExerciseList()
  return useMemo(() => toNameCatalog(exercises), [exercises])
}
