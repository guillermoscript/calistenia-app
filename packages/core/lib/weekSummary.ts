/**
 * Una sola «semana» para el inicio (#853).
 *
 * Hasta ahora convivían tres: `getWeeklyDoneCount` (calendario, sin cardio ni
 * circuito, contando repeticiones), `programProgress.sessionsThisWeek` (ventana
 * que arranca el día en que empezó el programa) y `settings.weeklyGoal`. El
 * inicio web enseñaba a la vez «3 de 4 esta semana» y «3/5».
 *
 * Esta es la que vale para todo «X de Y» del inicio:
 * - Semana de CALENDARIO, de lunes a domingo (`calendarWeek.ts`), la misma que
 *   la racha semanal (`weeklyStreak.ts`, #801).
 * - `done` = DÍAS distintos con al menos un entreno de cualquier tipo: fuerza,
 *   yoga, cardio, circuito o sesión libre. Dos sesiones el mismo día cuentan una.
 * - `planned` = días entrenables del programa que caen en esta semana y dentro
 *   de las fechas del programa.
 *
 * `programProgress` sigue existiendo para el progreso DENTRO del programa
 * (barra de fase, «Semana N de M»).
 */
import { isDayStr, mondayOf, weekDaysFrom } from './calendarWeek'
import { dayIdFromDateStr } from './programProgress'
import { isTrainableDay } from './training-day'
import type { DayId, ProgressMap, SessionDone, WeekDay } from '../types'

export type WeekCellState = 'done' | 'today' | 'in_progress' | 'planned' | 'rest' | 'before_start'

export interface WeekCell {
  /** `YYYY-MM-DD`. */
  day: string
  dayId: DayId
  /**
   * Precedencia: `done` > `in_progress` (solo hoy) > `before_start` > `today` >
   * `planned` > `rest`. Un día pasado entrenable sin hacer sigue siendo
   * `planned`: la UI decide si lo pinta como perdido (con `isPast`).
   */
  state: WeekCellState
  /** El programa planifica entreno ese día (y cae dentro de sus fechas). */
  trainable: boolean
  isToday: boolean
  isPast: boolean
}

export interface WeekSummaryInput {
  /** Hoy, `YYYY-MM-DD` local. */
  today: string
  /**
   * Días con al menos una actividad de cualquier tipo, `YYYY-MM-DD` local.
   * Repetidos y fechas inválidas se ignoran. Ver `activityDaysFromProgress`.
   */
  activityDays: Iterable<string>
  /** Semana tipo del programa activo; `[]` sin programa. */
  weekDays: readonly WeekDay[]
  /** Día local del alta: los anteriores salen `before_start`. */
  signupDay?: string | null
  /** Primer y último día del programa: fuera de ellos no hay nada planificado. */
  programStartDay?: string | null
  programEndDay?: string | null
  /** Hay una actividad en curso: la celda de hoy sale `in_progress`. */
  inProgressToday?: boolean
}

export interface WeekSummary {
  /** Lunes. */
  weekStart: string
  /** Domingo. */
  weekEnd: string
  /** Días distintos con actividad dentro de la semana. */
  done: number
  /** Días entrenables del programa dentro de la semana. */
  planned: number
  /** Lunes → domingo. */
  cells: WeekCell[]
}

export function getWeekSummary(input: WeekSummaryInput): WeekSummary {
  const { today, weekDays, signupDay, programStartDay, programEndDay, inProgressToday } = input
  const weekStart = mondayOf(today)
  const days = weekDaysFrom(weekStart)
  const activity = new Set<string>()
  for (const d of input.activityDays) if (isDayStr(d)) activity.add(d)

  const trainableIds = new Set(weekDays.filter(isTrainableDay).map(d => d.id))
  const validSignup = isDayStr(signupDay) ? signupDay : null
  const validStart = isDayStr(programStartDay) ? programStartDay : null
  const validEnd = isDayStr(programEndDay) ? programEndDay : null

  let done = 0
  let planned = 0
  const cells = days.map((day): WeekCell => {
    const dayId = dayIdFromDateStr(day) as DayId
    const inProgram = (!validStart || day >= validStart) && (!validEnd || day <= validEnd)
    const trainable = trainableIds.has(dayId) && inProgram
    const isToday = day === today
    const isDone = activity.has(day)
    if (isDone) done++
    if (trainable) planned++

    let state: WeekCellState
    if (isDone) state = 'done'
    else if (isToday && inProgressToday) state = 'in_progress'
    else if (validSignup && day < validSignup) state = 'before_start'
    else if (isToday) state = 'today'
    else state = trainable ? 'planned' : 'rest'

    return { day, dayId, state, trainable, isToday, isPast: day < today }
  })

  return { weekStart, weekEnd: days[6], done, planned, cells }
}

/**
 * Días con actividad según el `ProgressMap` de `useProgress`: TODOS los
 * marcadores `done_`, incluidos los días de cardio y de circuito del programa
 * (que `getDoneDates()` excluye a propósito para la racha diaria). Las sesiones
 * de cardio libres no viven en el `ProgressMap`: cada plataforma las suma con
 * las fechas que ya tiene cargadas.
 */
export function activityDaysFromProgress(progress: ProgressMap): string[] {
  const out = new Set<string>()
  for (const [key, value] of Object.entries(progress ?? {})) {
    if (!key.startsWith('done_')) continue
    const entry = value as SessionDone
    const day = entry?.date || key.split('_')[1]
    if (isDayStr(day)) out.add(day)
  }
  return [...out].sort()
}
