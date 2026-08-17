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
 * Trae las filas de `program_phases`, `program_exercises` y `program_day_config`
 * de un programa, en paralelo.
 *
 * `program_day_config` es opcional a propósito: es una colección que se añadió
 * después, así que un 404 se traga en silencio y devuelve una lista vacía —
 * cualquier otro error sí se registra. Los tres `getList` llevan
 * `$autoCancel: false` porque se lanzan juntos contra la misma instancia de
 * PocketBase y el autocancelado los mataría entre ellos.
 */
export async function fetchProgramDetailRows(programId: string): Promise<ProgramDetailRows> {
  const filter = pb.filter('program = {:pid}', { pid: programId })
  const [phasesRes, exercisesRes, dayConfigRes] = await Promise.all([
    pb.collection('program_phases').getList(1, 20, { filter, sort: 'sort_order', $autoCancel: false }),
    pb.collection('program_exercises').getList(1, 2000, { filter, sort: 'phase_number,sort_order', $autoCancel: false }),
    pb.collection('program_day_config').getList(1, 200, { filter, sort: 'phase_number,sort_order', $autoCancel: false })
      .catch((e: any) => {
        if (e?.status !== 404) console.warn('programDetailQuery: day config fetch failed', e)
        return { items: [] as RecordModel[] }
      }),
  ])

  return {
    phases: phasesRes.items,
    exercises: exercisesRes.items,
    dayConfigs: dayConfigRes.items,
  }
}
