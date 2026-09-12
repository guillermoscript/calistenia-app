/**
 * programDetailQuery — la consulta de detalle de programa, en un solo sitio (#474).
 *
 * `ProgramDetailPage.tsx` y el `fetchProgramDetail` de `hooks/usePrograms.ts`
 * hacían la misma consulta byte a byte (las tres mismas colecciones en un
 * `Promise.all`, los mismos `filter`/`sort`, el mismo `.catch` tolerante en
 * `program_day_config`) y sólo se diferenciaban en la forma de la salida.
 *
 * Aquí se unifica la **consulta**, no la salida: cada llamante sigue derivando la
 * forma que necesita a partir de las filas crudas (`workouts: ProgramWorkout[]`
 * en la página, `workoutsMap` en el hook). Reescribir el render de la página no
 * es este issue.
 */

import type { RecordModel } from 'pocketbase'
import { pb } from './pocketbase'

export interface ProgramDetailRows {
  phases: RecordModel[]
  exercises: RecordModel[]
  dayConfigs: RecordModel[]
}

/**
 * Tamaño de página con el que `getFullList` recorre cada colección.
 *
 * No es un tope: `getFullList` sigue pidiendo páginas hasta agotar el filtro.
 * Es solo cuántas filas entran en cada viaje, y 500 hace que el programa más
 * gordo que hay hoy en la base (732 ejercicios) se traiga en dos.
 */
const PAGE_SIZE = 500

/**
 * Trae las filas de `program_phases`, `program_exercises` y `program_day_config`
 * de un programa, en paralelo.
 *
 * Va con `getFullList` y no con `getList` (#614). Antes cada llamada llevaba su
 * propio tope escrito a mano —20 fases, 2.000 ejercicios, 200 day-configs— y un
 * tope de `getList` que se alcanza no da error: devuelve la primera página y se
 * calla. Un programa que pasara de 2.000 ejercicios se pintaría incompleto sin
 * que nada lo dijera. Estas tres consultas están acotadas por UN programa, así
 * que traerlo entero es lo correcto y el número mágico sobra.
 *
 * `program_day_config` es opcional a propósito: es una colección que se añadió
 * después, así que un 404 se traga en silencio y devuelve una lista vacía —
 * cualquier otro error sí se registra. Las tres consultas llevan
 * `$autoCancel: false` porque se lanzan juntas contra la misma instancia de
 * PocketBase y el autocancelado las mataría entre ellas.
 */
export async function fetchProgramDetailRows(programId: string): Promise<ProgramDetailRows> {
  const filter = pb.filter('program = {:pid}', { pid: programId })
  const [phases, exercises, dayConfigs] = await Promise.all([
    pb.collection('program_phases').getFullList({ batch: PAGE_SIZE, filter, sort: 'sort_order', $autoCancel: false }),
    pb.collection('program_exercises').getFullList({ batch: PAGE_SIZE, filter, sort: 'phase_number,sort_order', $autoCancel: false }),
    pb.collection('program_day_config').getFullList({ batch: PAGE_SIZE, filter, sort: 'phase_number,sort_order', $autoCancel: false })
      .catch((e: any) => {
        if (e?.status !== 404) console.warn('programDetailQuery: day config fetch failed', e)
        return [] as RecordModel[]
      }),
  ])

  return { phases, exercises, dayConfigs }
}
