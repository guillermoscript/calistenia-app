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
import { getTimezone } from './dateUtils'
import { wallClockDayOf } from './wallClock'

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

// ── Resto de lecturas de la ficha de programa ────────────────────────────────

/**
 * El registro del programa con el crédito del remix (#620): de qué programa
 * salió esta copia y quién lo escribió, en la misma petición.
 */
export function fetchProgramRecord(programId: string): Promise<RecordModel> {
  return pb.collection('programs').getOne(programId, {
    expand: 'forked_from,forked_from.created_by',
    $autoCancel: false,
  })
}

/**
 * Programas recomendados bajo la ficha. Solo públicos (#603): es una
 * recomendación hacia fuera, no la lista del autor, así que no entran los
 * borradores propios.
 */
export async function fetchRelatedPrograms(programId: string, limit = 6): Promise<RecordModel[]> {
  const res = await pb.collection('programs').getList(1, limit, {
    filter: pb.filter('is_active = true && visibility = "public" && id != {:pid}', { pid: programId }),
    sort: 'name',
  })
  return res.items
}

/**
 * Cuándo se entrenó por última vez cada día (`workout_key`) del programa, como
 * día local YYYY-MM-DD.
 *
 * El filtro es el mismo que el de `useProgress` (`program = pid || program = ""`):
 * las sesiones antiguas se guardaron sin programa y son del programa activo, así
 * que filtrar solo por `pid` perdía su historial. `fields` acotado y
 * `getFullList` en vez de `getList(1, 200)` (#614).
 *
 * `completed_at` guarda la HORA DE PARED del usuario con una Z de adorno, no un
 * instante (ver `wallClockDayOf`). `created` (el reloj de PB) sí es UTC real.
 */
export async function fetchProgramLastSessionDays(
  userId: string,
  programId: string,
): Promise<Record<string, string>> {
  const sessions = await pb.collection('sessions').getFullList({
    batch: PAGE_SIZE,
    filter: pb.filter('user = {:uid} && (program = {:pid} || program = "")', { uid: userId, pid: programId }),
    sort: '-completed_at',
    fields: 'workout_key,completed_at,created',
    $autoCancel: false,
  })
  return lastSessionDays(sessions as unknown as Parameters<typeof lastSessionDays>[0])
}

/** Parte pura de `fetchProgramLastSessionDays`: filas (más recientes primero) → día por `workout_key`. */
export function lastSessionDays(
  rows: Array<{ workout_key?: string; completed_at?: string; created?: string }>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const s of rows) {
    const key = s.workout_key
    if (!key || out[key]) continue
    const day = wallClockDayOf(s.completed_at, s.created, getTimezone())
    if (day) out[key] = day
  }
  return out
}
