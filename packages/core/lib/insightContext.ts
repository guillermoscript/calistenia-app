/**
 * insightContext — rollup multi-métrica de un usuario en una ventana móvil de
 * 7 o 30 días, compacto para un LLM (insights cross-metric, épica #128 Fase 2).
 *
 * ÚNICA implementación para cliente y servidor (#480). Antes había dos: esta
 * (con el singleton `pb` y la zona horaria `_tz` de dateUtils, ambos fijados
 * en el login) y un "port fiel" en mcp-server/src/api/insight-context-server.ts
 * que copiaba 700 líneas de matemáticas y tipos porque el cron atiende a
 * muchos usuarios (cada uno con su zona) en un mismo proceso. La diferencia
 * real era sólo la INYECCIÓN: qué cliente de PocketBase y qué zona horaria.
 * Así que aquí las dos cosas viajan como parámetro (`InsightDeps`) y cada lado
 * las inyecta:
 *  - cliente: `buildInsightContext.ts` pasa el singleton `pb`, `getTimezone()`
 *    y la lectura de calendario mes a mes (`fetchMonthActivity`, la misma que
 *    usa el calendario).
 *  - servidor: `insight-context-server.ts` pasa el superuser `pb`,
 *    `user.timezone` y una lectura de calendario en una sola ventana.
 *
 * Este módulo NO importa `./pocketbase` (que crea el cliente al cargar y exige
 * `initCore()`) ni `./dateUtils` (que arrastra i18next): sólo dayjs, las
 * matemáticas puras de sueño/composición corporal y tipos. Por eso mcp-server
 * puede importarlo tal cual.
 *
 * Ojo con los `import type`: no emiten nada en runtime, pero TypeScript SÍ
 * carga y typechequea el módulo. Por eso `MonthActivity` viene de
 * `./monthActivity.types` y no de `./monthActivity`, que importa el singleton
 * de PocketBase y `./dateUtils` para su `fetchMonthActivity` — con el import
 * al fichero grande el `tsc` de mcp-server pedía i18next (que no es
 * dependencia suya) aunque el bundle nunca lo necesitara.
 *
 * Fuentes:
 *  - calendario (cardio/circuitos/nutrición/agua/sueño/peso/medidas) vía
 *    `deps.fetchActivity`;
 *  - `sessions` (entrenamientos de fuerza): el calendario los excluye a
 *    propósito (viven en WorkoutContext/progress);
 *  - `daily_health_cache` (reloj vía Health Connect/HealthKit): Android-only,
 *    puede estar completamente ausente.
 *
 * Resiliente: cada fuente que falle degrada a "sin datos" — nunca lanza fuera
 * de buildInsightContext.
 */

import type PocketBase from 'pocketbase'
import type { MonthActivity } from './monthActivity.types'
import { addDaysIn, diffDaysIn, localMidnightAsUTCIn, todayStrIn, utcToLocalDateStrIn } from './tzDate'
import { bedtimeConsistencyMinutes, pctTrue, avgDefined } from './sleepStats'
import { estimateBodyFatNavy } from './body-composition'
import type { DailyHealthSummary, Sex } from '../types'

// ─── Tipos (contrato fijado por #124/#125; declarados UNA vez, aquí) ────────

// Sexo + altura para estimar BF% (método Navy) por fila de medidas (#227).
// Opcional: sin él (o incompleto) las filas llevan cintura pero no bodyFatPct.
export interface InsightBodyProfile {
  sex?: Sex
  heightCm?: number
}

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
  waistCm?: number // medidas corporales (#227)
  bodyFatPct?: number // estimado Navy, solo si hay cintura+cuello (+cadera mujer) y sexo/altura
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
  // Composición corporal (#227): tendencia de cintura y % grasa estimado (Navy).
  // Con peso estable + cintura bajando el LLM puede leer recomposición.
  waist: { firstCm: number | null; lastCm: number | null; deltaCm: number | null }
  bodyFat: { firstPct: number | null; lastPct: number | null; deltaPct: number | null }
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

/**
 * Lo que el rollup necesita del calendario: el subconjunto de MonthActivity
 * que buildDayRows lee de verdad (fotos y lumbar son sólo del calendario).
 * Es lo que devuelve `InsightDeps.fetchActivity`.
 */
export type InsightActivity = Pick<
  MonthActivity,
  'cardio' | 'circuits' | 'nutritionByDate' | 'waterByDate' | 'sleepByDate' | 'weightByDate' | 'measurementByDate'
>

export function emptyInsightActivity(): InsightActivity {
  return {
    cardio: [],
    circuits: [],
    nutritionByDate: {},
    waterByDate: {},
    sleepByDate: {},
    weightByDate: {},
    measurementByDate: {},
  }
}

export type StrengthByDate = Record<string, { workouts: number; workoutMinutes: number }>
export type WatchByDate = Record<string, { steps?: number; restingHr?: number; hrvMs?: number; vo2max?: number }>

/** Lo que cada lado (cliente/servidor) inyecta. */
export interface InsightDeps {
  /** Cliente de PocketBase ya autenticado (usuario en el cliente, superuser en el servidor). */
  pb: Pick<PocketBase, 'collection' | 'filter'>
  /** Zona IANA del usuario — determina qué día "es" cada timestamp. */
  tz: string
  /**
   * Lectura del calendario en [start, end] (YYYY-MM-DD locales, inclusive).
   * Debe degradar a datos vacíos si falla (nunca lanzar) — igual que el resto
   * de fuentes.
   */
  fetchActivity: (userId: string, start: string, end: string) => Promise<InsightActivity>
  /** Dónde avisar de una fuente caída. Por defecto console.warn. */
  warn?: (message: string, err: unknown) => void
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

/** Combina varias lecturas de calendario (una por mes tocado) en una sola. */
export function mergeInsightActivity(activities: InsightActivity[]): InsightActivity {
  const merged = emptyInsightActivity()
  for (const a of activities) {
    merged.cardio.push(...a.cardio)
    merged.circuits.push(...a.circuits)
    Object.assign(merged.nutritionByDate, a.nutritionByDate)
    Object.assign(merged.waterByDate, a.waterByDate)
    Object.assign(merged.sleepByDate, a.sleepByDate)
    Object.assign(merged.weightByDate, a.weightByDate)
    Object.assign(merged.measurementByDate, a.measurementByDate)
  }
  return merged
}

/**
 * Ventana [start, end] INMEDIATAMENTE anterior a una de `days` días que
 * empieza en `start` (misma longitud, sin solape). Pura y testeable sin PB.
 */
export function previousWindow(start: string, days: number, tz: string): { start: string; end: string } {
  const end = addDaysIn(start, -1, tz)
  return { start: addDaysIn(end, -(days - 1), tz), end }
}

export interface BuildDayRowsInput {
  activity: InsightActivity
  strengthByDate: StrengthByDate
  watchByDate: WatchByDate
  start: string
  end: string
  tz: string
  bodyProfile?: InsightBodyProfile
}

/**
 * Construye las filas por día a partir del calendario ya combinado más
 * fuerza/reloj (ya agrupados por fecha), recortando a [start, end]. Pura: no
 * toca PB, solo agrupa datos ya obtenidos.
 */
export function buildDayRows(input: BuildDayRowsInput): InsightDayRow[] {
  const { activity: merged, strengthByDate, watchByDate, start, end, tz, bodyProfile } = input
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
    const date = utcToLocalDateStrIn(c.started_at, tz)
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
    const date = utcToLocalDateStrIn(c.started_at, tz)
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

  // Medidas corporales (#227): cintura como señal directa; BF% Navy solo si el
  // registro trae cintura+cuello (+cadera en mujeres) y hay sexo/altura.
  for (const [date, m] of Object.entries(merged.measurementByDate)) {
    if (!inRange(date) || !m.waist) continue
    const row = ensure(date)
    row.waistCm = m.waist
    if (m.neck && bodyProfile?.sex && bodyProfile.heightCm) {
      const pct = estimateBodyFatNavy({
        sex: bodyProfile.sex,
        heightCm: bodyProfile.heightCm,
        waistCm: m.waist,
        neckCm: m.neck,
        hipsCm: m.hips,
      })
      if (pct != null) row.bodyFatPct = pct
    }
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

export interface SummarizeRowsInput {
  days: number
  /**
   * Ancla del conteo de racha actual ("días consecutivos hacia atrás desde
   * end"): no forma parte del contrato de tipos fijado por #124/#125, pero sin
   * él la racha actual no se puede anclar a "hoy" — los días sin ningún dato
   * no generan fila.
   */
  end: string
  tz: string
  watchAvailable: boolean
}

/**
 * Calcula el resumen agregado a partir de las filas por día. Pura: no toca PB
 * (testeable con arrays de InsightDayRow hechos a mano).
 */
export function summarizeRows(rows: InsightDayRow[], input: SummarizeRowsInput): InsightSummary {
  const { days, end, tz, watchAvailable } = input
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

  // Cintura y BF% (#227): mismo patrón first/last/delta que el peso.
  const waistRows = sorted.filter((r) => r.waistCm !== undefined)
  const firstCm = waistRows.length > 0 ? waistRows[0].waistCm! : null
  const lastCm = waistRows.length > 0 ? waistRows[waistRows.length - 1].waistCm! : null
  const deltaCm = firstCm !== null && lastCm !== null ? round1(lastCm - firstCm) : null

  const bfRows = sorted.filter((r) => r.bodyFatPct !== undefined)
  const firstPct = bfRows.length > 0 ? bfRows[0].bodyFatPct! : null
  const lastPct = bfRows.length > 0 ? bfRows[bfRows.length - 1].bodyFatPct! : null
  const deltaPct = firstPct !== null && lastPct !== null ? round1(lastPct - firstPct) : null

  const stepsDays = countDefined((r) => r.steps)
  const hrDays = countDefined((r) => r.restingHr)
  const hrvDays = countDefined((r) => r.hrvMs)

  // Racha más larga: mayor tramo de días consecutivos (calendario) con entrenamiento.
  const workoutDates = sorted.filter((r) => (r.workouts ?? 0) > 0).map((r) => r.date)
  let longestTrainingStreak = 0
  let run = 0
  for (let i = 0; i < workoutDates.length; i++) {
    run = i === 0 || diffDaysIn(workoutDates[i], workoutDates[i - 1], tz) === 1 ? run + 1 : 1
    longestTrainingStreak = Math.max(longestTrainingStreak, run)
  }

  // Racha actual: retrocede día a día desde `end`, tope en la longitud de la ventana.
  const workoutSet = new Set(workoutDates)
  let currentTrainingStreak = 0
  for (let k = 0; k < days; k++) {
    if (!workoutSet.has(addDaysIn(end, -k, tz))) break
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
    waist: { firstCm, lastCm, deltaCm },
    bodyFat: { firstPct, lastPct, deltaPct },
    watch: {
      available: watchAvailable,
      avgSteps: watchAvailable && stepsDays > 0 ? Math.round(sum((r) => r.steps) / stepsDays) : null,
      avgRestingHr: watchAvailable && hrDays > 0 ? Math.round(sum((r) => r.restingHr) / hrDays) : null,
      avgHrvMs: watchAvailable && hrvDays > 0 ? round1(sum((r) => r.hrvMs) / hrDays) : null,
    },
    streaks: { currentTrainingStreak, longestTrainingStreak },
  }
}

// ─── Orquestación (PB inyectado) ────────────────────────────────────────────

/**
 * Agrega toda la actividad de `userId` dentro de [start, end] (una ventana de
 * `days` días): calendario (vía deps.fetchActivity), entrenamientos de fuerza
 * y reloj. Cada fuente degrada a "sin datos" si falla — nunca lanza. Extraído
 * para poder llamarlo dos veces (ventana actual + anterior, #136) sin duplicar
 * la orquestación.
 */
async function fetchWindow(
  deps: InsightDeps,
  userId: string,
  start: string,
  end: string,
  days: number,
  bodyProfile?: InsightBodyProfile,
): Promise<{ rows: InsightDayRow[]; summary: InsightSummary; watchAvailable: boolean }> {
  const { pb, tz } = deps
  const warn = deps.warn ?? ((message, err) => console.warn(message, err))

  // 1. Calendario (cardio/circuitos/nutrición/agua/sueño/peso/medidas).
  let merged: InsightActivity
  try {
    merged = await deps.fetchActivity(userId, start, end)
  } catch (err) {
    warn('buildInsightContext: fetchActivity failed', err)
    merged = emptyInsightActivity()
  }

  // 2. Entrenamientos de fuerza — el calendario los excluye a propósito
  // (viven en `sessions`). Mismo campo `user` y misma fecha
  // (completed_at || created) que usa useProgress.ts.
  const strengthByDate: StrengthByDate = {}
  try {
    const sessions = (await pb.collection('sessions').getFullList({
      filter: pb.filter('user = {:uid} && completed_at >= {:start} && completed_at < {:end}', {
        uid: userId,
        start: localMidnightAsUTCIn(start, tz),
        end: localMidnightAsUTCIn(addDaysIn(end, 1, tz), tz),
      }),
      fields: 'id,completed_at,created,duration_seconds',
    })) as unknown as SessionLite[]

    const seconds: Record<string, number> = {}
    for (const s of sessions) {
      const date = utcToLocalDateStrIn(s.completed_at || s.created || '', tz)
      if (!date) continue
      const cur = strengthByDate[date] || (strengthByDate[date] = { workouts: 0, workoutMinutes: 0 })
      cur.workouts += 1
      seconds[date] = (seconds[date] ?? 0) + (s.duration_seconds || 0)
    }
    for (const [date, secs] of Object.entries(seconds)) {
      strengthByDate[date].workoutMinutes = Math.round(secs / 60)
    }
  } catch (err) {
    warn('buildInsightContext: sessions fetch failed', err)
  }

  // 3. Reloj (daily_health_cache) — Android-only, puede estar ausente del todo.
  const watchByDate: WatchByDate = {}
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
    warn('buildInsightContext: daily_health_cache fetch failed', err)
  }

  const rows = buildDayRows({ activity: merged, strengthByDate, watchByDate, start, end, tz, bodyProfile })
  const summary = summarizeRows(rows, { days, end, tz, watchAvailable })

  return { rows, summary, watchAvailable }
}

export interface BuildInsightContextOptions {
  days: 7 | 30
  withPrevious?: boolean
}

/**
 * Agrega la actividad de `userId` en los últimos `days` (7 o 30) días en un
 * InsightContext compacto para alimentar un LLM. Cada fuente degrada a "sin
 * datos" si falla — nunca lanza.
 *
 * `withPrevious` (#136): además calcula el summary (SOLO summary, no rows —
 * presupuesto de tokens) de la ventana inmediatamente anterior, misma
 * longitud, para que el LLM pueda razonar sobre tendencia. Se fetchea
 * SECUENCIALMENTE después de la ventana actual (nunca en paralelo): el SDK de
 * PocketBase auto-cancela requests idénticos concurrentes (ClientResponseError
 * 0) → todas las métricas vacías. El mismo gotcha motiva que las lecturas de
 * perfil vayan en serie antes de las ventanas.
 */
export async function buildInsightContext(
  deps: InsightDeps,
  userId: string,
  opts: BuildInsightContextOptions,
): Promise<InsightContext> {
  const { pb, tz } = deps
  const warn = deps.warn ?? ((message, err) => console.warn(message, err))
  const { days, withPrevious } = opts
  const end = todayStrIn(tz)
  const start = addDaysIn(end, -(days - 1), tz)
  const period: InsightContext['period'] = { type: days === 7 ? 'weekly' : 'monthly', days, start, end }

  // Sexo + altura para BF% (#227). SECUENCIAL antes de las ventanas. Degrada a
  // perfil vacío si falla.
  const bodyProfile: InsightBodyProfile = {}
  try {
    const user = await pb.collection('users').getOne(userId, { fields: 'height' })
    bodyProfile.heightCm = Number((user as { height?: number }).height) || undefined
  } catch (err) {
    warn('buildInsightContext: user height fetch failed', err)
  }
  try {
    const goals = await pb
      .collection('nutrition_goals')
      .getFirstListItem(pb.filter('user = {:uid}', { uid: userId }), { fields: 'sex' })
    bodyProfile.sex = ((goals as { sex?: string }).sex as Sex) || undefined
  } catch (err) {
    warn('buildInsightContext: nutrition_goals sex fetch failed', err)
  }

  const current = await fetchWindow(deps, userId, start, end, days, bodyProfile)

  let previousSummary: InsightSummary | undefined
  if (withPrevious) {
    const prev = previousWindow(start, days, tz)
    try {
      const prevWindow = await fetchWindow(deps, userId, prev.start, prev.end, days, bodyProfile)
      previousSummary = prevWindow.summary
    } catch (err) {
      warn('buildInsightContext: previous window fetch failed', err)
    }
  }

  let primaryGoal: string | undefined
  try {
    const user = await pb.collection('users').getOne(userId, { fields: 'primary_goal' })
    primaryGoal = (user as { primary_goal?: string }).primary_goal || undefined
  } catch (err) {
    warn('buildInsightContext: user primary_goal fetch failed', err)
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
