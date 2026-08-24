/**
 * training-stats — agregados de fuerza sobre el ProgressMap que `useProgress`
 * ya tiene en memoria: músculos más entrenados, ranking de ejercicios,
 * récords, tendencia semanal y totales.
 *
 * Función pura: sin React, sin PocketBase, sin estado de módulo. La fecha de
 * hoy y el resolver de ejercicios se inyectan, así que los tests son
 * deterministas. La aritmética de fechas va en UTC sobre cadenas
 * `YYYY-MM-DD` (una fecha civil no tiene DST; ver `streak.ts`), para no
 * depender del timezone de módulo de `dateUtils`.
 */
import { parseRepsForPR, estimate1RM } from './pr-utils'
import { MUSCLE_GROUPS } from './muscles'
import type { ExerciseResolver, ResolvedExercise } from './exercise-resolver'
import type { ProgressMap, ExerciseLog, SessionDone } from '../types'

export type StatsPeriod = '4w' | '3m' | '1y' | 'all'

export const STATS_PERIODS: readonly StatsPeriod[] = ['4w', '3m', '1y', 'all']

/** Semanas ISO de la gráfica de tendencia. Ventana fija, independiente del periodo. */
export const WEEKLY_BUCKETS = 12

const PERIOD_DAYS: Record<Exclude<StatsPeriod, 'all'>, number> = { '4w': 28, '3m': 90, '1y': 365 }

export type BalanceFamily = 'push' | 'pull' | 'legs' | 'core'

/** `cuello` y `cardio` no entran en el balance a propósito. */
export const BALANCE_FAMILIES: Record<BalanceFamily, readonly string[]> = {
  push: ['pecho', 'hombros', 'triceps'],
  pull: ['espalda', 'biceps', 'antebrazos'],
  legs: ['gluteos', 'cuadriceps', 'isquios', 'pantorrillas', 'cadera'],
  core: ['core', 'lumbar'],
}

export type ExerciseBest =
  | { kind: 'reps'; reps: number; date: string }
  | { kind: 'weight'; weight: number; reps: number; e1rm: number; date: string }
  /** Ejercicios de temporizador: la serie más larga, en segundos. */
  | { kind: 'time'; seconds: number; date: string }

export interface MuscleStat { group: string; sets: number; reps: number; share: number }

export interface ExerciseStat {
  key: string
  name: string
  sessions: number
  sets: number
  /** 0 en ejercicios de temporizador (sus «reps» son segundos → `seconds`). */
  reps: number
  /** Segundos acumulados; solo > 0 en ejercicios de temporizador. */
  seconds: number
  isTimer: boolean
  lastDate: string
  best: ExerciseBest | null
}

export interface RecordStat { key: string; name: string; best: ExerciseBest; isNew: boolean }

export interface WeeklyStat { weekStart: string; sessions: number; sets: number; reps: number }

export interface TrainingStats {
  period: StatsPeriod
  /** Inclusivo. `from` es null cuando `period === 'all'`. */
  range: { from: string | null; to: string }
  totals: {
    sessions: number
    sets: number
    /** Suma de `parseRepsForPR(reps)`; las series no numéricas («max») y las de temporizador aportan 0. */
    reps: number
    /** Suma de `durationSeconds` / 60, redondeada. */
    minutes: number
    /** reps × kg de las series con peso > 0. */
    volumeKg: number
    avgSetsPerSession: number
    avgMinutesPerSession: number
  }
  muscles: {
    /** Orden desc por `sets`; sólo grupos con series. */
    groups: MuscleStat[]
    /** Porcentajes sobre series asignadas; suman 100 o son todo 0. */
    balance: Record<BalanceFamily, number>
    /** Series del periodo cuyo ejercicio no resolvió a ningún grupo. */
    unassignedSets: number
  }
  /** Orden desc por sesiones, luego series, luego nombre. Sólo identidades resueltas. */
  exercises: ExerciseStat[]
  /** Sobre TODO el histórico; orden desc por fecha del récord. */
  records: RecordStat[]
  weekly: WeeklyStat[]
  /** Índice 0 = lunes … 6 = domingo. Sesiones del periodo. */
  weekdays: number[]
  /** Series del periodo con identidad desconocida (`resolved === false`). */
  unknownExerciseSets: number
}

export interface TrainingStatsInput {
  progress: ProgressMap
  resolve: ExerciseResolver
  period: StatsPeriod
  /** `YYYY-MM-DD` local. */
  today: string
}

// ── Fechas civiles en UTC ────────────────────────────────────────────────────

const DAY_MS = 86_400_000

function toUTC(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function fromUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export function shiftDate(date: string, days: number): string {
  return fromUTC(toUTC(date) + days * DAY_MS)
}

/** Lunes de la semana ISO que contiene `date`. */
export function isoWeekStart(date: string): string {
  const ms = toUTC(date)
  return fromUTC(ms - weekdayIndexOf(ms) * DAY_MS)
}

function weekdayIndexOf(ms: number): number {
  return (new Date(ms).getUTCDay() + 6) % 7
}

/** 0 = lunes … 6 = domingo. */
export function weekdayIndex(date: string): number {
  return weekdayIndexOf(toUTC(date))
}

function isValidDate(d: unknown): d is string {
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)
}

function isSessionDone(v: ExerciseLog | SessionDone): v is SessionDone {
  return (v as SessionDone).done === true
}

// ── Récords ──────────────────────────────────────────────────────────────────

interface BestEntry { name: string; best: ExerciseBest }

/**
 * Un ejercicio con alguna serie con peso reporta el récord de peso (el 1RM
 * estimado dice más que las reps a peso corporal); si nunca tuvo peso, el de
 * reps. Empate → la fecha más antigua (el primer día que se alcanzó).
 */
function updateBest(map: Map<string, BestEntry>, r: ResolvedExercise, weight: number | undefined, n: number | null, date: string): void {
  if (!r.resolved) return
  const cur = map.get(r.key)
  if (r.isTimer) {
    if (n == null) return
    const better = !cur || cur.best.kind !== 'time' || n > cur.best.seconds || (n === cur.best.seconds && date < cur.best.date)
    if (better) map.set(r.key, { name: r.name, best: { kind: 'time', seconds: n, date } })
    return
  }
  const e1rm = estimate1RM(weight, n)
  if (e1rm != null) {
    const better = !cur || cur.best.kind !== 'weight' || e1rm > cur.best.e1rm || (e1rm === cur.best.e1rm && date < cur.best.date)
    if (better) map.set(r.key, { name: r.name, best: { kind: 'weight', weight: weight as number, reps: n ?? 1, e1rm, date } })
    return
  }
  if (n == null) return
  if (cur) {
    if (cur.best.kind !== 'reps') return
    if (n < cur.best.reps || (n === cur.best.reps && date >= cur.best.date)) return
  }
  map.set(r.key, { name: r.name, best: { kind: 'reps', reps: n, date } })
}

// ── Balance ──────────────────────────────────────────────────────────────────

/** Porcentajes enteros que suman exactamente 100 (mayor resto), o todo 0. */
function toPercentages(counts: Record<BalanceFamily, number>): Record<BalanceFamily, number> {
  const keys = Object.keys(counts) as BalanceFamily[]
  const total = keys.reduce((a, k) => a + counts[k], 0)
  const out = { push: 0, pull: 0, legs: 0, core: 0 }
  if (total === 0) return out
  const exact = keys.map(k => ({ k, v: (counts[k] / total) * 100 }))
  let assigned = 0
  for (const e of exact) { out[e.k] = Math.floor(e.v); assigned += out[e.k] }
  const byRemainder = [...exact].sort((a, b) => (b.v - Math.floor(b.v)) - (a.v - Math.floor(a.v)))
  for (let i = 0; assigned < 100 && i < byRemainder.length; i++, assigned++) out[byRemainder[i].k]++
  return out
}

// ── Motor ────────────────────────────────────────────────────────────────────

export function computeTrainingStats({ progress, resolve, period, today }: TrainingStatsInput): TrainingStats {
  const from = period === 'all' ? null : shiftDate(today, -(PERIOD_DAYS[period] - 1))
  const inRange = (d: string) => d <= today && (from == null || d >= from)

  // Tendencia: 12 cubos ISO acabando en la semana de hoy, rellenos a 0.
  const thisWeek = isoWeekStart(today)
  const weekly: WeeklyStat[] = []
  const weeklyByStart = new Map<string, WeeklyStat>()
  for (let i = WEEKLY_BUCKETS - 1; i >= 0; i--) {
    const b: WeeklyStat = { weekStart: shiftDate(thisWeek, -7 * i), sessions: 0, sets: 0, reps: 0 }
    weekly.push(b)
    weeklyByStart.set(b.weekStart, b)
  }
  const weeklyFrom = weekly[0].weekStart
  const weekBucketFor = (d: string): WeeklyStat | undefined =>
    d >= weeklyFrom && d <= today ? weeklyByStart.get(isoWeekStart(d)) : undefined

  let sessions = 0
  let minutes = 0
  const weekdays = [0, 0, 0, 0, 0, 0, 0]

  let sets = 0
  let reps = 0
  let volumeKg = 0
  let unassignedSets = 0
  let assignedSets = 0
  let unknownExerciseSets = 0
  const muscleAgg = new Map<string, { sets: number; reps: number }>()
  const familyCounts: Record<BalanceFamily, number> = { push: 0, pull: 0, legs: 0, core: 0 }
  const exAgg = new Map<string, { name: string; isTimer: boolean; sessionKeys: Set<string>; sets: number; reps: number; seconds: number; lastDate: string }>()
  const bestAll = new Map<string, BestEntry>()

  for (const v of Object.values(progress)) {
    if (!v || !isValidDate(v.date)) continue
    const d = v.date
    if (d > today) continue

    if (isSessionDone(v)) {
      if (v.cardioSessionId) continue
      const n = v.count ?? 1
      const bucket = weekBucketFor(d)
      if (bucket) bucket.sessions += n
      if (!inRange(d)) continue
      sessions += n
      minutes += (v.durationSeconds ?? 0) / 60
      weekdays[weekdayIndex(d)] += n
      continue
    }

    if (!Array.isArray(v.sets) || v.sets.length === 0) continue
    const r = resolve(v.exerciseId, v.workoutKey)
    const rangeHit = inRange(d)
    const bucket = weekBucketFor(d)

    for (const s of v.sets) {
      const n = parseRepsForPR(s.reps)
      // En un ejercicio de temporizador el número son segundos, no reps.
      const nReps = r.isTimer ? 0 : (n ?? 0)
      const nSeconds = r.isTimer ? (n ?? 0) : 0
      if (bucket) { bucket.sets++; bucket.reps += nReps }
      updateBest(bestAll, r, s.weight, n, d)
      if (!rangeHit) continue

      sets++
      reps += nReps
      if (s.weight && s.weight > 0) volumeKg += nReps * s.weight

      if (!r.resolved) unknownExerciseSets++

      if (r.muscleGroups.length === 0) {
        unassignedSets++
      } else {
        assignedSets++
        for (const g of r.muscleGroups) {
          const m = muscleAgg.get(g) ?? { sets: 0, reps: 0 }
          m.sets++
          m.reps += nReps
          muscleAgg.set(g, m)
        }
        for (const fam of Object.keys(BALANCE_FAMILIES) as BalanceFamily[]) {
          if (r.muscleGroups.some(g => BALANCE_FAMILIES[fam].includes(g))) familyCounts[fam]++
        }
      }

      if (r.resolved) {
        const e = exAgg.get(r.key) ?? { name: r.name, isTimer: r.isTimer, sessionKeys: new Set<string>(), sets: 0, reps: 0, seconds: 0, lastDate: d }
        e.sessionKeys.add(`${d}|${v.workoutKey}`)
        e.sets++
        e.reps += nReps
        e.seconds += nSeconds
        if (d > e.lastDate) e.lastDate = d
        exAgg.set(r.key, e)
      }
    }
  }

  const groupOrder = new Map<string, number>(MUSCLE_GROUPS.map((g, i) => [g, i]))
  const groups: MuscleStat[] = [...muscleAgg.entries()]
    .map(([group, m]) => ({ group, sets: m.sets, reps: m.reps, share: assignedSets > 0 ? m.sets / assignedSets : 0 }))
    .sort((a, b) => b.sets - a.sets || (groupOrder.get(a.group) ?? 99) - (groupOrder.get(b.group) ?? 99))

  const exercises: ExerciseStat[] = [...exAgg.entries()]
    .map(([key, e]) => ({ key, name: e.name, sessions: e.sessionKeys.size, sets: e.sets, reps: e.reps, seconds: e.seconds, isTimer: e.isTimer, lastDate: e.lastDate, best: bestAll.get(key)?.best ?? null }))
    .sort((a, b) => b.sessions - a.sessions || b.sets - a.sets || a.name.localeCompare(b.name))

  const records: RecordStat[] = [...bestAll.entries()]
    .map(([key, e]) => ({ key, name: e.name, best: e.best, isNew: inRange(e.best.date) }))
    .sort((a, b) => b.best.date.localeCompare(a.best.date) || a.name.localeCompare(b.name))

  const roundedMinutes = Math.round(minutes)
  return {
    period,
    range: { from, to: today },
    totals: {
      sessions,
      sets,
      reps,
      minutes: roundedMinutes,
      volumeKg: Math.round(volumeKg),
      avgSetsPerSession: sessions > 0 ? Math.round((sets / sessions) * 10) / 10 : 0,
      avgMinutesPerSession: sessions > 0 ? Math.round(minutes / sessions) : 0,
    },
    muscles: { groups, balance: toPercentages(familyCounts), unassignedSets },
    exercises,
    records,
    weekly,
    weekdays,
    unknownExerciseSets,
  }
}
