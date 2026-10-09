/**
 * Lecturas puntuales de `exercises_catalog` en PocketBase, ya mapeadas a
 * `CatalogExercise` (#474).
 *
 * La web leía la colección en siete sitios con `pb.collection(...)` a pelo y
 * cada uno decidía a mano qué hacer con el registro (algunos usaban la clave
 * aleatoria de PB como identidad, otros leían columnas que no existen). Pasar
 * siempre por `mapCatalogRecord()` es lo que garantiza la identidad canónica
 * (`catalogExerciseIdentity()`). La LISTA completa para pintar pickers sigue
 * siendo `useCatalogExerciseList()`; esto es para lo que esa lista no cubre:
 * un solo ejercicio, el registro recién importado de wger o las claves de
 * relación.
 */

import { pb, isPocketBaseAvailable } from './pocketbase'
import { mapCatalogRecord, type CatalogExercise } from './exerciseCatalog'

/**
 * Un ejercicio por su slug o por su clave de PB (la ficha de detalle recibe
 * cualquiera de las dos). `null` si PB no está disponible, falla o no existe:
 * quien llama cae al catálogo empaquetado.
 */
export async function fetchCatalogExercise(slugOrId: string): Promise<CatalogExercise | null> {
  if (!slugOrId) return null
  try {
    if (!(await isPocketBaseAvailable())) return null
    const res = await pb.collection('exercises_catalog').getList(1, 1, {
      requestKey: null,
      filter: pb.filter('slug = {:val} || id = {:val}', { val: slugOrId }),
    })
    return res.items.length > 0 ? mapCatalogRecord(res.items[0]) : null
  } catch {
    return null
  }
}

/** Un registro concreto por su clave de PB (p. ej. el que acaba de crear un import de wger). */
export async function fetchCatalogExerciseByRecordId(recordId: string): Promise<CatalogExercise> {
  const rec = await pb.collection('exercises_catalog').getOne(recordId, { requestKey: null })
  return mapCatalogRecord(rec)
}

/**
 * Registros de PB tal cual (ordenados por nombre), con `CatalogExercise.id` =
 * clave de PB. Es lo que necesita una RELACIÓN (`challenges.exercise_id`
 * apunta a la clave de PB, no al slug), de ahí que no sea la lista fusionada.
 * `fields` recorta columnas: el mapper tolera las que falten.
 */
export async function fetchCatalogRecords(
  opts: { fields?: string; perPage?: number } = {},
): Promise<CatalogExercise[]> {
  const res = await pb.collection('exercises_catalog').getList(1, opts.perPage ?? 200, {
    sort: 'name',
    ...(opts.fields ? { fields: opts.fields } : {}),
    $autoCancel: false,
  })
  return res.items.map(mapCatalogRecord)
}
