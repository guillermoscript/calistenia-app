/**
 * Resumen de cierre de un programa (#941, épica #932).
 *
 * Función pura: recibe los logs del historial YA agrupados por ejercicio
 * (`groupLogsByResolvedExercise`, que funde la clave de catálogo con la de slot
 * del programa) y las fechas del programa, y devuelve lo que enseña la pantalla
 * de cierre:
 *
 * - **Semana 1 frente a la última:** para los ejercicios más entrenados, la mejor
 *   marca de la primera semana del programa en que se registró frente a la de
 *   la última. Solo si hay datos en dos semanas distintas: nunca «0 → 12».
 * - **Récords:** ejercicios cuya mejor marca del programa supera la mejor de
 *   ANTES de empezarlo. Sin historial previo no hay récord que batir.
 *
 * Los PR de `settings` no sirven: guardan solo la mejor marca ACTUAL y sin
 * fecha. Todo sale de `sets_log`.
 *
 * Unidad de una serie: kg si lleva lastre; si no, segundos (ejercicio de
 * temporizador o «30 s») o repeticiones. Un ejercicio se compara en UNA unidad,
 * la que tenga datos en las dos semanas, prefiriendo kg > s > reps.
 */

import type { ExerciseLog } from '../types'

export type RecapUnit = 'kg' | 's' | 'reps'

export interface RecapExerciseInput {
  key: string
  name: string
  /** Del resolutor: sus «reps» son segundos. */
  isTimer?: boolean
  logs: readonly ExerciseLog[]
}

export interface RecapComparison {
  key: string
  name: string
  unit: RecapUnit
  firstWeek: number
  lastWeek: number
  first: number
  last: number
  delta: number
}

export interface RecapRecord {
  key: string
  name: string
  unit: RecapUnit
  previous: number
  value: number
}

export interface ProgramRecap {
  comparisons: RecapComparison[]
  records: RecapRecord[]
  /** Series registradas dentro de las fechas del programa. */
  setsLogged: number
  /** Ejercicios distintos entrenados dentro del programa. */
  exercisesTrained: number
}

export interface BuildProgramRecapInput {
  exercises: readonly RecapExerciseInput[]
  startDay: string | null
  endDay: string | null
  maxComparisons?: number
  maxRecords?: number
}

const UNIT_PREFERENCE: RecapUnit[] = ['kg', 's', 'reps']
const SECONDS_RE = /\d\s*(s|seg|sec|segundos|seconds)\b/i

/** Valor y unidad de una serie, o `null` si no se puede leer. */
export function setValue(set: { reps?: string; weight?: number }, isTimer = false): { unit: RecapUnit; value: number } | null {
  if (typeof set.weight === 'number' && Number.isFinite(set.weight) && set.weight > 0) {
    return { unit: 'kg', value: set.weight }
  }
  const raw = String(set.reps ?? '')
  const m = raw.match(/\d+(?:[.,]\d+)?/)
  if (!m) return null
  const value = Number(m[0].replace(',', '.'))
  if (!Number.isFinite(value) || value <= 0) return null
  return { unit: isTimer || SECONDS_RE.test(raw) ? 's' : 'reps', value }
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/** Semana del programa (1-indexada) de un día. */
function weekOf(startDay: string, day: string): number {
  return Math.floor(daysBetween(startDay, day) / 7) + 1
}

export function buildProgramRecap({
  exercises,
  startDay,
  endDay,
  maxComparisons = 4,
  maxRecords = 5,
}: BuildProgramRecapInput): ProgramRecap {
  const empty: ProgramRecap = { comparisons: [], records: [], setsLogged: 0, exercisesTrained: 0 }
  if (!startDay || !endDay) return empty

  const candidates: (RecapComparison & { days: number })[] = []
  const records: (RecapRecord & { gain: number })[] = []
  let setsLogged = 0
  let exercisesTrained = 0

  for (const ex of exercises) {
    // unidad → semana → mejor marca; y unidad → mejor de antes del programa.
    const byUnitWeek = new Map<RecapUnit, Map<number, number>>()
    const bestBefore = new Map<RecapUnit, number>()
    const bestIn = new Map<RecapUnit, number>()
    const daysIn = new Set<string>()

    for (const log of ex.logs) {
      if (!log?.date || !Array.isArray(log.sets)) continue
      const inProgram = log.date >= startDay && log.date <= endDay
      const before = log.date < startDay
      if (!inProgram && !before) continue
      for (const set of log.sets) {
        const v = setValue(set, ex.isTimer)
        if (!v) continue
        if (before) {
          bestBefore.set(v.unit, Math.max(bestBefore.get(v.unit) ?? 0, v.value))
          continue
        }
        setsLogged++
        daysIn.add(log.date)
        bestIn.set(v.unit, Math.max(bestIn.get(v.unit) ?? 0, v.value))
        const week = weekOf(startDay, log.date)
        const weeks = byUnitWeek.get(v.unit) ?? new Map<number, number>()
        weeks.set(week, Math.max(weeks.get(week) ?? 0, v.value))
        byUnitWeek.set(v.unit, weeks)
      }
    }

    if (daysIn.size === 0) continue
    exercisesTrained++

    for (const unit of UNIT_PREFERENCE) {
      const weeks = byUnitWeek.get(unit)
      if (!weeks || weeks.size < 2) continue
      const ordered = [...weeks.keys()].sort((a, b) => a - b)
      const firstWeek = ordered[0]
      const lastWeek = ordered[ordered.length - 1]
      const first = weeks.get(firstWeek)!
      const last = weeks.get(lastWeek)!
      candidates.push({ key: ex.key, name: ex.name, unit, firstWeek, lastWeek, first, last, delta: last - first, days: daysIn.size })
      break
    }

    for (const unit of UNIT_PREFERENCE) {
      const prev = bestBefore.get(unit)
      const now = bestIn.get(unit)
      if (prev === undefined || now === undefined || now <= prev) continue
      records.push({ key: ex.key, name: ex.name, unit, previous: prev, value: now, gain: (now - prev) / prev })
      break
    }
  }

  // Los más entrenados primero; a igualdad, la mayor mejora relativa.
  candidates.sort((a, b) => b.days - a.days || (b.delta / b.first) - (a.delta / a.first) || a.name.localeCompare(b.name))
  records.sort((a, b) => b.gain - a.gain || a.name.localeCompare(b.name))

  return {
    comparisons: candidates.slice(0, maxComparisons).map(({ days: _days, ...c }) => c),
    records: records.slice(0, maxRecords).map(({ gain: _gain, ...r }) => r),
    setsLogged,
    exercisesTrained,
  }
}

/** Número de una marca sin ceros de sobra: 12, 12.5, nunca 12.50. */
export function formatRecapNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10)
}
