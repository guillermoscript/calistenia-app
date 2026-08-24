/**
 * Progreso DENTRO de un programa (#616): «Semana 3 de 12 · 2 de 4 entrenos ·
 * hoy toca Pull», derivado de `user_programs.started_at` en vez de un contador
 * global del usuario.
 *
 * Funciones puras sobre filas ya descargadas, igual que `community-programs.ts`
 * o `cumulative-scoring.ts`, para que todo el cálculo sea testeable en el
 * entorno node de vitest. Nada aquí llama a `Date.now()`: el día de hoy y el
 * conversor UTC→día local entran como parámetros.
 *
 * Decisiones que fija este módulo:
 *
 * - **Las semanas son las de `buildWeekWindows`** (`community-programs.ts`):
 *   ventanas consecutivas de 7 días de CALENDARIO desde `started_at`, con el
 *   último día incluido y la última recortada si la duración no es múltiplo de
 *   7. Se reutiliza en vez de reimplementarla porque esa aritmética sobre
 *   cadenas `YYYY-MM-DD` es justo la que evita que un cambio de horario de
 *   verano produzca una semana de 6 u 8 días.
 * - **La semana del programa no coincide con la semana del calendario**: quien
 *   se apunta un miércoles tiene su semana 1 de miércoles a martes. Los días
 *   del programa (`lun`…`dom`) siguen siendo días de la semana reales, así que
 *   una ventana completa de 7 días contiene exactamente uno de cada.
 * - **`percent` es progreso TEMPORAL**, no de adherencia: es la barra que
 *   acompaña a «Semana 3 de 12». La adherencia de la semana en curso se lee de
 *   `sessionsThisWeek` / `plannedThisWeek`.
 * - **El día se deduce del SUFIJO de `workout_key`**, nunca del prefijo de
 *   fase. Las claves son `p{fase}_{día}` y las sesiones históricas conservan la
 *   fase con la que se entrenó: si mirásemos el prefijo, cambiar de fase
 *   borraría el progreso de la semana en curso.
 * - **Contenido mal configurado devuelve un estado seguro**, nunca lanza: sin
 *   `started_at` o con `duration_weeks <= 0` la pantalla tiene que poder
 *   pintarse igual.
 */

import { buildWeekWindows, type WeekWindow } from './community-programs'
import { countWorkouts, type SessionRowForTotal } from './cumulative-scoring'
import { WEEK_ORDER, isTrainableDay } from './training-day'
import type { DayId, Phase, WeekDay } from '../types'

export type { WeekWindow }

// ─── Día de la semana desde una cadena YYYY-MM-DD ────────────────────────────

/**
 * `YYYY-MM-DD` → `DayId`. Se calcula con `Date.UTC`, que para una fecha sin
 * hora es aritmética pura y no depende de la zona del dispositivo: construir
 * `new Date('2026-08-24')` y leer `getDay()` daría el día ANTERIOR en cualquier
 * zona al oeste de Greenwich.
 *
 * Devuelve `null` si la cadena no es una fecha válida.
 */
export function dayIdFromDateStr(dateStr: string): DayId | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '')
  if (!m) return null
  const [, y, mo, d] = m
  const ts = Date.UTC(Number(y), Number(mo) - 1, Number(d))
  if (Number.isNaN(ts)) return null
  const date = new Date(ts)
  // Redondeo de mes/día imposible (p. ej. "2026-02-31" → 3 de marzo): dato roto.
  if (date.getUTCMonth() !== Number(mo) - 1 || date.getUTCDate() !== Number(d)) return null
  // getUTCDay(): 0 = domingo, y WEEK_ORDER empieza en lunes.
  const DAY_BY_UTC_INDEX: readonly DayId[] = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab']
  return DAY_BY_UTC_INDEX[date.getUTCDay()]
}

// ─── Fases ───────────────────────────────────────────────────────────────────

/**
 * `"1-6"` → `{ from: 1, to: 6 }`; `"7"` → `{ from: 7, to: 7 }`. Tolera espacios
 * y guiones largos porque el campo lo teclea quien crea el programa. `null` si
 * no hay ningún número reconocible.
 */
export function parsePhaseWeeks(weeks: string): { from: number; to: number } | null {
  const nums = String(weeks ?? '').match(/\d+/g)
  if (!nums || nums.length === 0) return null
  const from = Number(nums[0])
  const to = nums.length > 1 ? Number(nums[1]) : from
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null
  return from <= to ? { from, to } : { from: to, to: from }
}

/**
 * Fase que corresponde a `week` según los rangos `weeks` de `program_phases`.
 *
 * Si la semana cae en un hueco entre rangos (contenido mal configurado) se
 * devuelve la última fase que ya empezó, y si ninguna empezó, la primera: la
 * pantalla siempre tiene una fase que pintar. `null` solo si no hay fases.
 */
export function phaseForWeek(phases: readonly Phase[], week: number): number | null {
  if (!phases.length) return null
  const ordered = [...phases].sort((a, b) => a.id - b.id)
  const ranges = ordered.map(p => ({ id: p.id, range: parsePhaseWeeks(p.weeks) }))

  const exact = ranges.find(r => r.range && week >= r.range.from && week <= r.range.to)
  if (exact) return exact.id

  // Sin coincidencia exacta: la última fase cuyo rango ya empezó.
  let fallback = ordered[0].id
  for (const r of ranges) {
    if (r.range && r.range.from <= week) fallback = r.id
  }
  return fallback
}

// ─── Entrada y salida ────────────────────────────────────────────────────────

/** Fila de `sessions` que necesita el cálculo (subconjunto del registro de PB). */
export interface ProgramSessionRow extends SessionRowForTotal {
  workout_key?: string
  completed_at?: string
}

export interface ProgramProgressInput {
  /**
   * `user_programs.started_at`, timestamp UTC de PocketBase. Vacío = el
   * enrollment es anterior a que se guardara la fecha: estado seguro.
   */
  startedAt: string
  /** `programs.duration_weeks`. `0` en programas sin duración declarada. */
  durationWeeks: number
  /** `program_phases` ya mapeadas (`weeks` es el rango, p. ej. `"1-6"`). */
  phases: readonly Phase[]
  /** Días de la semana del programa; los `type: 'rest'` no cuentan como planificados. */
  weekDays: readonly WeekDay[]
  /** Filas de `sessions` del usuario para ESTE programa. */
  sessions: readonly ProgramSessionRow[]
  /** Convierte un timestamp UTC de PB al día local del usuario. */
  utcToLocalDay: (utc: string) => string
  /** Día local de hoy, `YYYY-MM-DD`. Inyectado para poder testear con fechas fijas. */
  today: string
  /**
   * `user_programs.current_phase`: la fase que el usuario fijó a mano. Gana
   * sobre la derivada. `0`/`null`/`undefined` = automática.
   */
  phaseOverride?: number | null
}

/** De dónde sale `currentPhase`, para que la UI pueda decir «automática». */
export type PhaseSource = 'override' | 'derived' | 'fallback'

export interface ProgramProgress {
  /** El programa ya arrancó respecto a `today`. */
  hasStarted: boolean
  /** `today` es posterior al último día del programa. */
  isCompleted: boolean
  /**
   * Semana en curso, 1-indexada. `null` si el programa aún no empezó o si no
   * hay ventanas (duración inválida). Un programa terminado devuelve su última
   * semana, no `null`: la cabecera debe poder decir «Semana 12 de 12».
   */
  currentWeek: number | null
  /** Semanas totales según `duration_weeks`. `0` si no hay duración válida. */
  totalWeeks: number
  /** Fase a usar en las claves `p{fase}_{día}`. Siempre >= 1. */
  currentPhase: number
  phaseSource: PhaseSource
  /** Ventana de la semana en curso (la última si el programa terminó). */
  weekWindow: WeekWindow | null
  /** Entrenos completados dentro de `weekWindow`, deduplicados. */
  sessionsThisWeek: number
  /** Días entrenables que caen dentro de `weekWindow`. */
  plannedThisWeek: number
  /** Progreso temporal del programa, 0..100 (enteros). */
  percent: number
  /**
   * Siguiente día entrenable de esta semana que aún no está hecho, empezando
   * por hoy. `null` si la semana ya está completa, si no hay días entrenables,
   * o si el programa no ha empezado / ya terminó.
   */
  nextDay: DayId | null
}

const EMPTY: ProgramProgress = {
  hasStarted: false,
  isCompleted: false,
  currentWeek: null,
  totalWeeks: 0,
  currentPhase: 1,
  phaseSource: 'fallback',
  weekWindow: null,
  sessionsThisWeek: 0,
  plannedThisWeek: 0,
  percent: 0,
  nextDay: null,
}

/** Fase válida fijada a mano, o `null`. */
function normalizeOverride(phaseOverride: number | null | undefined): number | null {
  if (typeof phaseOverride !== 'number' || !Number.isFinite(phaseOverride)) return null
  const n = Math.floor(phaseOverride)
  return n >= 1 ? n : null
}

/**
 * Resuelve la fase: override manual > derivada de la semana > primera fase > 1.
 * Se exporta porque el hook la necesita también cuando no hay progreso que
 * calcular (programa sin duración, usuario recién inscrito).
 */
export function resolvePhase(
  phases: readonly Phase[],
  currentWeek: number | null,
  phaseOverride?: number | null,
): { phase: number; source: PhaseSource } {
  const override = normalizeOverride(phaseOverride)
  if (override !== null) return { phase: override, source: 'override' }
  if (currentWeek !== null) {
    const derived = phaseForWeek(phases, currentWeek)
    if (derived !== null) return { phase: derived, source: 'derived' }
  }
  const first = phases.length ? [...phases].sort((a, b) => a.id - b.id)[0].id : 1
  return { phase: first || 1, source: 'fallback' }
}

/** Día (`DayId`) al que apunta un `workout_key` `p{fase}_{día}`. */
function dayIdFromWorkoutKey(workoutKey: string | undefined): DayId | null {
  if (!workoutKey) return null
  const idx = workoutKey.indexOf('_')
  if (idx < 0) return null
  const suffix = workoutKey.slice(idx + 1) as DayId
  return WEEK_ORDER.includes(suffix) ? suffix : null
}

// ─── Cálculo ─────────────────────────────────────────────────────────────────

export function computeProgramProgress(input: ProgramProgressInput): ProgramProgress {
  const { startedAt, durationWeeks, phases, weekDays, sessions, utcToLocalDay, today, phaseOverride } = input

  const startDay = startedAt ? utcToLocalDay(startedAt) : ''
  const totalWeeks = Number.isFinite(durationWeeks) ? Math.max(0, Math.floor(durationWeeks)) : 0
  const windows = startDay ? buildWeekWindows(startDay, totalWeeks * 7) : []

  if (!windows.length || !today) {
    // Sin ventanas no hay semana ni barra, pero la fase sigue haciendo falta
    // para construir las claves `p{fase}_{día}` de la pantalla de entreno.
    const { phase, source } = resolvePhase(phases, null, phaseOverride)
    return { ...EMPTY, totalWeeks, currentPhase: phase, phaseSource: source }
  }

  const firstDay = windows[0].startDay
  const lastDay = windows[windows.length - 1].endDay
  const hasStarted = today >= firstDay
  const isCompleted = today > lastDay

  // Ventana en curso; antes de empezar es la primera y después la última, para
  // que la cabecera pueda pintar «Semana 1 de 12» o «Semana 12 de 12» en vez de
  // quedarse sin datos en los dos extremos.
  const activeWindow = !hasStarted
    ? windows[0]
    : isCompleted
      ? windows[windows.length - 1]
      : (windows.find(w => today >= w.startDay && today <= w.endDay) ?? windows[windows.length - 1])

  const currentWeek = hasStarted ? activeWindow.week : null
  const { phase, source } = resolvePhase(phases, currentWeek, phaseOverride)

  // ── Entrenos de la semana ──────────────────────────────────────────────────
  const inWindow = (timestamp?: string) => {
    if (!timestamp) return false
    const day = utcToLocalDay(timestamp)
    return day >= activeWindow.startDay && day <= activeWindow.endDay
  }
  const sessionsInWindow = sessions.filter(s => inWindow(s.completed_at))
  // Cardio va vacío a propósito: las sesiones de cardio de un día de programa
  // se registran TAMBIÉN en `sessions` con su `workout_key` (ver `useProgress`),
  // así que pasarlas aquí las contaría dos veces.
  const sessionsThisWeek = countWorkouts([...sessionsInWindow], [], utcToLocalDay)

  // `duration_weeks` son semanas enteras, así que toda ventana mide exactamente
  // 7 días de calendario y contiene cada día de la semana una vez: los días
  // planificados de la ventana son, sin más, los días entrenables del programa.
  const plannedDays = weekDays.filter(isTrainableDay)
  const plannedThisWeek = plannedDays.length

  // ── Siguiente día por hacer ────────────────────────────────────────────────
  const doneDayIds = new Set<DayId>()
  for (const s of sessionsInWindow) {
    const id = dayIdFromWorkoutKey(s.workout_key)
    if (id) doneDayIds.add(id)
  }

  let nextDay: DayId | null = null
  if (hasStarted && !isCompleted) {
    const todayId = dayIdFromDateStr(today)
    const startIdx = todayId ? WEEK_ORDER.indexOf(todayId) : 0
    for (let i = 0; i < WEEK_ORDER.length; i++) {
      const id = WEEK_ORDER[(startIdx + i) % WEEK_ORDER.length]
      if (!plannedDays.some(d => d.id === id)) continue
      if (doneDayIds.has(id)) continue
      nextDay = id
      break
    }
  }

  // ── Porcentaje temporal ────────────────────────────────────────────────────
  const totalDays = windows.reduce((n, w) => n + w.days, 0)
  let percent = 0
  if (isCompleted) {
    percent = 100
  } else if (hasStarted && totalDays > 0) {
    // +1 porque el primer día ya cuenta como transcurrido: quien empieza hoy no
    // ve una barra a 0 tras entrenar.
    const elapsed = countDaysInclusive(firstDay, today)
    percent = Math.max(0, Math.min(100, Math.round((elapsed / totalDays) * 100)))
  }

  return {
    hasStarted,
    isCompleted,
    currentWeek,
    totalWeeks: windows.length,
    currentPhase: phase,
    phaseSource: source,
    weekWindow: activeWindow,
    sessionsThisWeek,
    plannedThisWeek,
    percent,
    nextDay,
  }
}

/** Días transcurridos de `from` a `to`, ambos incluidos. 0 si `to` < `from`. */
function countDaysInclusive(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0
  return Math.round((b - a) / 86_400_000) + 1
}
