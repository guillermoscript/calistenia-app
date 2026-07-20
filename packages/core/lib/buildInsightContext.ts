/**
 * buildInsightContext — agrega la actividad multi-métrica de un usuario en una
 * ventana móvil de 7 o 30 días en un rollup compacto para un LLM (insights
 * cross-metric, épica #128 Fase 2).
 *
 * Framework-agnostic: sin React ni React Native. Reutiliza fetchMonthActivity
 * (misma fuente que el calendario) para cardio/circuitos/nutrición/agua/sueño/
 * peso, y añade dos lecturas directas propias:
 *  - `sessions` (entrenamientos de fuerza): fetchMonthActivity los excluye a
 *    propósito (viven en WorkoutContext/progress, no en el calendario).
 *  - `daily_health_cache` (reloj vía Health Connect/HealthKit): Android-only,
 *    puede estar completamente ausente.
 *
 * Resiliente: cada fuente que falle degrada a "sin datos" — nunca lanza fuera
 * de buildInsightContext.
 */

import { pb } from './pocketbase'
import { todayStr, addDays, utcToLocalDateStr, localMidnightAsUTC, diffDays } from './dateUtils'
import { fetchMonthActivity, emptyMonthActivity, type MonthActivity } from './monthActivity'
import { bedtimeConsistencyMinutes, pctTrue, avgDefined } from './sleepStats'
import type { DailyHealthSummary } from '../types'

export interface InsightDayRow {
  date: string // YYYY-MM-DD local
  workouts?: number // sesiones de fuerza ese día
  workoutMinutes?: number
  cardioSessions?: number
  cardioKm?: number
  cardioMinutes?: number
  circuitSessions?: number
  meals?: number
  calories?: number
  waterMl?: number
  sleepMinutes?: number
  sleepQuality?: number
  awakenings?: number
  caffeine?: boolean
  screenBeforeBed?: boolean
  stressLevel?: number
  bedtime?: string // "HH:MM"
  weightKg?: number
  steps?: number // reloj (daily_health_cache)
  restingHr?: number
  hrvMs?: number
  vo2max?: number
}

export interface InsightSummary {
  days: number // longitud de la ventana (7 | 30)
  daysWithAnyData: number
  workouts: { total: number; daysTrained: number }
  cardio: { sessions: number; totalKm: number; totalMinutes: number }
  circuits: { sessions: number }
  nutrition: { daysLogged: number; avgCalories: number | null; avgMeals: number | null }
  water: { daysLogged: number; avgMl: number | null }
  sleep: {
    daysLogged: number
    avgMinutes: number | null
    avgQuality: number | null
    avgAwakenings: number
    pctCaffeine: number
    pctScreenBeforeBed: number
    avgStress: number
    bedtimeConsistencyMin: number
  }
  weight: { firstKg: number | null; lastKg: number | null; deltaKg: number | null }
  watch: { available: boolean; avgSteps: number | null; avgRestingHr: number | null; avgHrvMs: number | null }
  streaks: { currentTrainingStreak: number; longestTrainingStreak: number }
}

export interface InsightContext {
  userId: string
  period: { type: 'weekly' | 'monthly'; days: number; start: string; end: string } // start/end YYYY-MM-DD local
  rows: InsightDayRow[] // SOLO días con >=1 dato, orden ascendente por fecha (ahorra tokens)
  summary: InsightSummary
  watchAvailable: boolean
  // Resumen agregado de la ventana INMEDIATAMENTE anterior (mismo tamaño), solo
  // si se pidió `withPrevious`. Únicamente el summary — nunca las filas, para no
  // inflar el presupuesto de tokens del prompt (épica #128 Fase 3, #136).
  previousSummary?: InsightSummary
  // Objetivo principal declarado en el onboarding (#226) — el LLM interpreta
  // las señales según lo que el usuario quiere lograr, no solo el delta de peso.
  primaryGoal?: string
}

// Forma mínima de un registro `sessions` (entrenamiento de fuerza) — solo los
// campos que necesitamos, igual que CircuitSessionLite en monthActivity.ts.
interface SessionLite {
  id: string
  completed_at?: string
  created?: string
  duration_seconds?: number
}

const round1 = (n: number): number => Math.round(n * 10) / 10
const round2 = (n: number): number => Math.round(n * 100) / 100

// ─── Helpers puros (testeables sin PB) ──────────────────────────────────────

/** Pares (year, month0) que toca la ventana [start, end] (YYYY-MM-DD), inclusive. */
export function monthsInRange(start: string, end: string): Array<{ year: number; month0: number }> {
  const [startYear, startMonth] = start.split('-').map(Number)
  const [endYear, endMonth] = end.split('-').map(Number)
  const months: Array<{ year: number; month0: number }> = []
  let year = startYear
  let month0 = startMonth - 1
  const endMonth0 = endMonth - 1
  while (year < endYear || (year === endYear && month0 <= endMonth0)) {
    months.push({ year, month0 })
    month0 += 1
    if (month0 > 11) {
      month0 = 0
      year += 1
    }
  }
  return months
}

/** Combina varios MonthActivity (uno por mes tocado) en uno solo. */
export function mergeMonthActivity(activities: MonthActivity[]): MonthActivity {
  const merged = emptyMonthActivity()
  for (const a of activities) {
    merged.cardio.push(...a.cardio)
    merged.circuits.push(...a.circuits)
    Object.assign(merged.nutritionByDate, a.nutritionByDate)
    Object.assign(merged.waterByDate, a.waterByDate)
    Object.assign(merged.sleepByDate, a.sleepByDate)
    Object.assign(merged.weightByDate, a.weightByDate)
    Object.assign(merged.measurementByDate, a.measurementByDate)
    Object.assign(merged.photosByDate, a.photosByDate)
    Object.assign(merged.lumbarByDate, a.lumbarByDate)
  }
  return merged
}

/**
 * Ventana [start, end] INMEDIATAMENTE anterior a una de `days` días que
 * empieza en `start` (misma longitud, sin solape). Pura y testeable sin PB.
 */
export function previousWindow(start: string, days: number): { start: string; end: string } {
  const end = addDays(start, -1)
  return { start: addDays(end, -(days - 1)), end }
}

/**
 * Construye las filas por día a partir de un MonthActivity ya combinado más
 * fuerza/reloj (ya agrupados por fecha), recortando a [start, end]. Pura: no
 * toca PB, solo agrupa datos ya obtenidos.
 */
export function buildDayRows(
  merged: MonthActivity,
  strengthByDate: Record<string, { workouts: number; workoutMinutes: number }>,
  watchByDate: Record<string, { steps?: number; restingHr?: number; hrvMs?: number; vo2max?: number }>,
  start: string,
  end: string,
): InsightDayRow[] {
  const inRange = (date: string): boolean => date >= start && date <= end
  const map = new Map<string, InsightDayRow>()
  const ensure = (date: string): InsightDayRow => {
    let row = map.get(date)
    if (!row) {
      row = { date }
      map.set(date, row)
    }
    return row
  }

  // Cardio: puede haber varias sesiones el mismo día → sumamos segundos aparte
  // y redondeamos una sola vez al final (evita arrastre de redondeo).
  const cardioSeconds = new Map<string, number>()
  for (const c of merged.cardio) {
    const date = utcToLocalDateStr(c.started_at)
    if (!date || !inRange(date)) continue
    const row = ensure(date)
    row.cardioSessions = (row.cardioSessions ?? 0) + 1
    row.cardioKm = round2((row.cardioKm ?? 0) + (c.distance_km || 0))
    cardioSeconds.set(date, (cardioSeconds.get(date) ?? 0) + (c.duration_seconds || 0))
  }
  for (const [date, seconds] of cardioSeconds) {
    const row = map.get(date)
    if (row) row.cardioMinutes = Math.round(seconds / 60)
  }

  for (const c of merged.circuits) {
    const date = utcToLocalDateStr(c.started_at)
    if (!date || !inRange(date)) continue
    ensure(date).circuitSessions = (map.get(date)!.circuitSessions ?? 0) + 1
  }

  for (const [date, n] of Object.entries(merged.nutritionByDate)) {
    if (!inRange(date)) continue
    const row = ensure(date)
    row.meals = n.meals
    row.calories = n.calories
  }

  for (const [date, w] of Object.entries(merged.waterByDate)) {
    if (!inRange(date)) continue
    ensure(date).waterMl = w.totalMl
  }

  for (const [date, s] of Object.entries(merged.sleepByDate)) {
    if (!inRange(date)) continue
    const row = ensure(date)
    row.sleepMinutes = s.duration_minutes
    row.sleepQuality = s.quality
    row.awakenings = s.awakenings
    row.caffeine = s.caffeine
    row.screenBeforeBed = s.screen_before_bed
    row.stressLevel = s.stress_level
    row.bedtime = s.bedtime
  }

  for (const [date, w] of Object.entries(merged.weightByDate)) {
    if (!inRange(date)) continue
    ensure(date).weightKg = w.weight_kg
  }

  for (const [date, s] of Object.entries(strengthByDate)) {
    if (!inRange(date)) continue
    const row = ensure(date)
    row.workouts = s.workouts
    row.workoutMinutes = s.workoutMinutes
  }

  for (const [date, w] of Object.entries(watchByDate)) {
    if (!inRange(date)) continue
    const row = ensure(date)
    if (w.steps !== undefined) row.steps = w.steps
    if (w.restingHr !== undefined) row.restingHr = w.restingHr
    if (w.hrvMs !== undefined) row.hrvMs = w.hrvMs
    if (w.vo2max !== undefined) row.vo2max = w.vo2max
  }

  return [...map.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/**
 * Calcula el resumen agregado a partir de las filas por día. Pura: no toca PB
 * (testeable con arrays de InsightDayRow hechos a mano).
 *
 * `end` ancla el conteo de racha actual ("consecutive days counting back from
 * end"): no forma parte del contrato de tipos fijado por #124/#125 (solo
 * InsightDayRow/InsightSummary/InsightContext lo son), pero sin él la racha
 * actual no se puede anclar a "hoy" — los días sin ningún dato no generan fila.
 */
export function summarizeRows(
  rows: InsightDayRow[],
  days: number,
  end: string,
  watchAvailable: boolean,
): InsightSummary {
  const sorted = [...rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  const sum = (get: (r: InsightDayRow) => number | undefined): number =>
    sorted.reduce((acc, r) => acc + (get(r) ?? 0), 0)
  const countDefined = (get: (r: InsightDayRow) => number | undefined): number =>
    sorted.filter((r) => get(r) !== undefined).length

  const workoutsTotal = sum((r) => r.workouts)
  const daysTrained = sorted.filter((r) => (r.workouts ?? 0) > 0).length

  const cardioSessions = sum((r) => r.cardioSessions)
  const cardioKm = round2(sum((r) => r.cardioKm))
  const cardioMinutes = sum((r) => r.cardioMinutes)

  const circuitSessions = sum((r) => r.circuitSessions)

  const nutritionDays = countDefined((r) => r.meals)
  const caloriesTotal = sum((r) => r.calories)
  const mealsTotal = sum((r) => r.meals)

  const waterDays = countDefined((r) => r.waterMl)
  const waterTotal = sum((r) => r.waterMl)

  const sleepDays = countDefined((r) => r.sleepMinutes)
  const sleepMinutesTotal = sum((r) => r.sleepMinutes)
  const sleepQualityDays = countDefined((r) => r.sleepQuality)
  const sleepQualityTotal = sum((r) => r.sleepQuality)
  const avgAwakenings = avgDefined(sorted.map((r) => r.awakenings))
  const pctCaffeine = pctTrue(sorted.map((r) => r.caffeine))
  const pctScreenBeforeBed = pctTrue(sorted.map((r) => r.screenBeforeBed))
  const avgStress = avgDefined(sorted.map((r) => r.stressLevel))
  const bedtimeConsistencyMin = bedtimeConsistencyMinutes(
    sorted.map((r) => r.bedtime).filter((b): b is string => b !== undefined),
  )

  const weightRows = sorted.filter((r) => r.weightKg !== undefined)
  const firstKg = weightRows.length > 0 ? weightRows[0].weightKg! : null
  const lastKg = weightRows.length > 0 ? weightRows[weightRows.length - 1].weightKg! : null
  const deltaKg = firstKg !== null && lastKg !== null ? round2(lastKg - firstKg) : null

  const stepsDays = countDefined((r) => r.steps)
  const hrDays = countDefined((r) => r.restingHr)
  const hrvDays = countDefined((r) => r.hrvMs)

  // Racha más larga: mayor tramo de días consecutivos (calendario) con entrenamiento.
  const workoutDates = sorted.filter((r) => (r.workouts ?? 0) > 0).map((r) => r.date)
  let longestTrainingStreak = 0
  let run = 0
  for (let i = 0; i < workoutDates.length; i++) {
    run = i === 0 || diffDays(workoutDates[i], workoutDates[i - 1]) === 1 ? run + 1 : 1
    longestTrainingStreak = Math.max(longestTrainingStreak, run)
  }

  // Racha actual: retrocede día a día desde `end`, tope en la longitud de la ventana.
  const workoutSet = new Set(workoutDates)
  let currentTrainingStreak = 0
  for (let k = 0; k < days; k++) {
    if (!workoutSet.has(addDays(end, -k))) break
    currentTrainingStreak += 1
  }

  return {
    days,
    daysWithAnyData: sorted.length,
    workouts: { total: workoutsTotal, daysTrained },
    cardio: { sessions: cardioSessions, totalKm: cardioKm, totalMinutes: cardioMinutes },
    circuits: { sessions: circuitSessions },
    nutrition: {
      daysLogged: nutritionDays,
      avgCalories: nutritionDays > 0 ? Math.round(caloriesTotal / nutritionDays) : null,
      avgMeals: nutritionDays > 0 ? round1(mealsTotal / nutritionDays) : null,
    },
    water: { daysLogged: waterDays, avgMl: waterDays > 0 ? Math.round(waterTotal / waterDays) : null },
    sleep: {
      daysLogged: sleepDays,
      avgMinutes: sleepDays > 0 ? Math.round(sleepMinutesTotal / sleepDays) : null,
      avgQuality: sleepQualityDays > 0 ? round1(sleepQualityTotal / sleepQualityDays) : null,
      avgAwakenings,
      pctCaffeine,
      pctScreenBeforeBed,
      avgStress,
      bedtimeConsistencyMin,
    },
    weight: { firstKg, lastKg, deltaKg },
    watch: {
      available: watchAvailable,
      avgSteps: watchAvailable && stepsDays > 0 ? Math.round(sum((r) => r.steps) / stepsDays) : null,
      avgRestingHr: watchAvailable && hrDays > 0 ? Math.round(sum((r) => r.restingHr) / hrDays) : null,
      avgHrvMs: watchAvailable && hrvDays > 0 ? round1(sum((r) => r.hrvMs) / hrDays) : null,
    },
    streaks: { currentTrainingStreak, longestTrainingStreak },
  }
}

// ─── Orquestación (PB) ───────────────────────────────────────────────────────

/**
 * Agrega toda la actividad de `userId` dentro de [start, end] (una ventana de
 * `days` días) desde PB: calendario (cardio/circuitos/nutrición/agua/sueño/
 * peso), entrenamientos de fuerza y reloj. Cada fuente degrada a "sin datos"
 * si falla — nunca lanza. Extraído de buildInsightContext para poder llamarlo
 * dos veces (ventana actual + anterior, #136) sin duplicar la orquestación.
 */
async function fetchWindow(
  userId: string,
  start: string,
  end: string,
  days: number,
): Promise<{ rows: InsightDayRow[]; summary: InsightSummary; watchAvailable: boolean }> {
  // 1. Calendario (cardio/circuitos/nutrición/agua/sueño/peso), un fetch por
  // mes calendario que la ventana toca, combinados en uno solo.
  // SECUENCIAL a propósito: una ventana trailing puede tocar 2 meses; llamar a
  // fetchMonthActivity concurrentemente dispararía requests idénticos por
  // colección (mismo path) que el SDK de PocketBase auto-cancela
  // (ClientResponseError 0) → todas las métricas vacías. Awaitar cada mes evita
  // la colisión.
  const months = monthsInRange(start, end)
  const activities: MonthActivity[] = []
  for (const { year, month0 } of months) {
    try {
      activities.push(await fetchMonthActivity(userId, year, month0))
    } catch (err) {
      console.warn('buildInsightContext: fetchMonthActivity failed', year, month0, err)
      activities.push(emptyMonthActivity())
    }
  }
  const merged = mergeMonthActivity(activities)

  // 2. Entrenamientos de fuerza — fetchMonthActivity los excluye a propósito
  // (viven en `sessions`, no en el calendario). Mismo campo `user` y misma
  // fecha (completed_at || created) que usa useProgress.ts.
  const strengthByDate: Record<string, { workouts: number; workoutMinutes: number }> = {}
  try {
    const sessions = (await pb.collection('sessions').getFullList({
      filter: pb.filter('user = {:uid} && completed_at >= {:start} && completed_at < {:end}', {
        uid: userId,
        start: localMidnightAsUTC(start),
        end: localMidnightAsUTC(addDays(end, 1)),
      }),
      fields: 'id,completed_at,created,duration_seconds',
    })) as unknown as SessionLite[]

    const seconds: Record<string, number> = {}
    for (const s of sessions) {
      const date = utcToLocalDateStr(s.completed_at || s.created || '')
      if (!date) continue
      const cur = strengthByDate[date] || (strengthByDate[date] = { workouts: 0, workoutMinutes: 0 })
      cur.workouts += 1
      seconds[date] = (seconds[date] ?? 0) + (s.duration_seconds || 0)
    }
    for (const [date, secs] of Object.entries(seconds)) {
      strengthByDate[date].workoutMinutes = Math.round(secs / 60)
    }
  } catch (err) {
    console.warn('buildInsightContext: sessions fetch failed', err)
  }

  // 3. Reloj (daily_health_cache) — Android-only, puede estar ausente del todo.
  const watchByDate: Record<string, { steps?: number; restingHr?: number; hrvMs?: number; vo2max?: number }> = {}
  let watchAvailable = false
  try {
    const healthRows = (await pb.collection('daily_health_cache').getFullList({
      filter: pb.filter('user = {:uid} && date >= {:start} && date <= {:end}', { uid: userId, start, end }),
    })) as unknown as DailyHealthSummary[]

    if (healthRows.length > 0) {
      watchAvailable = true
      for (const r of healthRows) {
        if (!r.date) continue
        watchByDate[r.date] = { steps: r.steps, restingHr: r.resting_hr, hrvMs: r.hrv_ms, vo2max: r.vo2max }
      }
    }
  } catch (err) {
    console.warn('buildInsightContext: daily_health_cache fetch failed', err)
  }

  const rows = buildDayRows(merged, strengthByDate, watchByDate, start, end)
  const summary = summarizeRows(rows, days, end, watchAvailable)

  return { rows, summary, watchAvailable }
}

/**
 * Agrega la actividad de `userId` en los últimos `days` (7 o 30) días en un
 * InsightContext compacto para alimentar un LLM. Cada fuente degrada a "sin
 * datos" si falla — nunca lanza.
 *
 * `withPrevious` (#136): además calcula el summary (SOLO summary, no rows —
 * presupuesto de tokens) de la ventana inmediatamente anterior, misma
 * longitud, para que el LLM pueda razonar sobre tendencia. Se fetchea
 * SECUENCIALMENTE después de la ventana actual (nunca en paralelo) — el mismo
 * gotcha de auto-cancel de PocketBase que motiva el for-loop de meses aplica
 * igual entre ventana actual y anterior.
 */
export async function buildInsightContext(
  userId: string,
  opts: { days: 7 | 30; withPrevious?: boolean },
): Promise<InsightContext> {
  const { days, withPrevious } = opts
  const end = todayStr()
  const start = addDays(end, -(days - 1))
  const period: InsightContext['period'] = { type: days === 7 ? 'weekly' : 'monthly', days, start, end }

  const current = await fetchWindow(userId, start, end, days)

  let previousSummary: InsightSummary | undefined
  if (withPrevious) {
    const prev = previousWindow(start, days)
    try {
      const prevWindow = await fetchWindow(userId, prev.start, prev.end, days)
      previousSummary = prevWindow.summary
    } catch (err) {
      console.warn('buildInsightContext: previous window fetch failed', err)
    }
  }

  let primaryGoal: string | undefined
  try {
    const user = await pb.collection('users').getOne(userId, { fields: 'primary_goal' })
    primaryGoal = (user as { primary_goal?: string }).primary_goal || undefined
  } catch (err) {
    console.warn('buildInsightContext: user primary_goal fetch failed', err)
  }

  return {
    userId,
    period,
    rows: current.rows,
    summary: current.summary,
    watchAvailable: current.watchAvailable,
    ...(previousSummary ? { previousSummary } : {}),
    ...(primaryGoal ? { primaryGoal } : {}),
  }
}
