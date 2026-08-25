/**
 * Lógica pura del detalle de un programa (#473).
 *
 * La pantalla `program/[id]` de móvil mapeaba el registro de `programs` con
 * `toProgramMeta(p: any)` y deducía la semana tipo con su propio `toRows`.
 *
 * Ojo con la tentación de reutilizar `buildWeekDays` de `usePrograms`: un
 * comentario de esa pantalla decía que `toRows` replicaba su orden, pero **no
 * son equivalentes**. `buildWeekDays` devuelve la semana completa en orden fijo
 * `lun…dom` y rellena sábado y domingo con días de descanso por defecto cuando
 * faltan; esta vista solo enseña los días que el programa define, en el orden
 * `sort_order` en que llegan. Meter los descansos de relleno aquí añadiría dos
 * días que el programa no tiene.
 */

import { localize } from './i18n-db'
import type { ProgramMeta } from '../types'
import type { TranslatableField } from './i18n-db'

/** Un día de la semana tipo, ya localizado para pintar directo. */
export interface ProgramDayRow {
  dayId: string
  name: string
  focus: string
  type: string
  color: string
}

/** Fila de `program_day_config` o de `program_exercises` con los campos del día. */
export interface ProgramDaySourceRow {
  day_id: string
  day_name?: TranslatableField
  day_focus?: TranslatableField
  day_type?: string
  day_color?: string
}

/** Fila de `programs`. */
export interface ProgramRow {
  id: string
  name?: TranslatableField
  description?: TranslatableField
  duration_weeks?: number
  created_by?: string
  is_official?: boolean
  is_featured?: boolean
  visibility?: string
  difficulty?: string
  days_per_week?: number
  instructions?: TranslatableField
}

const DEFAULT_DAY_COLOR = '#888899'

/**
 * Mapea un registro de `programs` a la forma que pinta la pantalla.
 *
 * `discipline` sale siempre como `'calistenia'`: el dato real no está en la
 * fila del programa, se deduce de los días (ver `refineDiscipline`).
 */
export function toProgramMeta(row: ProgramRow, locale: string): ProgramMeta {
  return {
    id: row.id,
    name: localize(row.name, locale),
    description: localize(row.description, locale),
    duration_weeks: row.duration_weeks,
    created_by: row.created_by || undefined,
    is_official: row.is_official || false,
    is_featured: row.is_featured || false,
    // Vacío en filas anteriores a #603: el editor lo hidrata como `private`.
    visibility: row.visibility || undefined,
    difficulty: row.difficulty || undefined,
    discipline: 'calistenia',
    days_per_week: typeof row.days_per_week === 'number' ? row.days_per_week : undefined,
    // «Cómo seguir este programa» (#618). Siempre string, aunque sea vacío: la
    // ficha distingue «no cargado» (undefined) de «el autor no escribió nada».
    instructions: localize(row.instructions, locale),
  } as ProgramMeta
}

/**
 * Días únicos de la semana tipo, en el orden en que llegan y sin repetir
 * `day_id` — las filas de `program_exercises` traen un registro por ejercicio,
 * así que un día con seis ejercicios aparece seis veces.
 */
export function buildProgramDayRows(
  rows: ProgramDaySourceRow[],
  locale: string,
): ProgramDayRow[] {
  const seen = new Map<string, ProgramDayRow>()
  for (const r of rows) {
    if (!r.day_id || seen.has(r.day_id)) continue
    seen.set(r.day_id, {
      dayId: r.day_id,
      name: localize(r.day_name, locale),
      focus: localize(r.day_focus, locale),
      type: r.day_type ?? '',
      color: r.day_color || DEFAULT_DAY_COLOR,
    })
  }
  return [...seen.values()]
}

/**
 * Disciplina real del programa, deducida de sus días: si todos los que no son
 * descanso son de yoga, el programa es de yoga. Los del catálogo ya la traen;
 * esto solo hace falta para el que se trae por id.
 */
export function refineDiscipline(days: ProgramDayRow[]): 'yoga' | null {
  const nonRest = days.filter(d => d.type !== 'rest')
  if (nonRest.length === 0) return null
  return nonRest.every(d => d.type === 'yoga') ? 'yoga' : null
}
