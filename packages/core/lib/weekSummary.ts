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
import { utcToLocalDateStr } from './dateUtils'
import { dayIdFromDateStr } from './programProgress'
import { isTrainableDay } from './training-day'
import type { DayId, ProgressMap, SessionDone, WeekDay } from '../types'

export type WeekCellState = 'done' | 'today' | 'in_progress' | 'missed' | 'planned' | 'rest' | 'before_start'

export interface WeekCell {
  /** `YYYY-MM-DD`. */
  day: string
  dayId: DayId
  /**
   * Precedencia: `done` > `in_progress` (solo hoy) > `before_start` > `today` >
   * `missed` > `planned` > `rest`.
   *
   * `missed` (#809) = día entrenable de esta semana, ANTERIOR a hoy y sin
   * ninguna actividad. Se decide aquí y no en cada pantalla para que web y
   * móvil digan lo mismo. Como `done`, mira la FECHA de la actividad y no la
   * clave del entreno: cambiar de fase a mitad de semana no lo altera.
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
   * Repetidos, fechas inválidas y fechas posteriores a `today` se ignoran.
   * Ver `activityDaysFromProgress`.
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
  /** Celdas `missed`: entrenables, ya pasadas y sin actividad. */
  missed: number
  /** Lunes → domingo. */
  cells: WeekCell[]
}

export function getWeekSummary(input: WeekSummaryInput): WeekSummary {
  const { today, weekDays, signupDay, programStartDay, programEndDay, inProgressToday } = input
  const weekStart = mondayOf(today)
  const days = weekDaysFrom(weekStart)
  const activity = new Set<string>()
  // Las fechas posteriores a `today` no cuentan (reloj desajustado, sesión
  // registrada a mano): `computeWeeklyStreak` (#801) también las ignora.
  for (const d of input.activityDays) if (isDayStr(d) && d <= today) activity.add(d)

  const trainableIds = new Set(weekDays.filter(isTrainableDay).map(d => d.id))
  const validSignup = isDayStr(signupDay) ? signupDay : null
  const validStart = isDayStr(programStartDay) ? programStartDay : null
  const validEnd = isDayStr(programEndDay) ? programEndDay : null

  let done = 0
  let planned = 0
  let missed = 0
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
    else if (trainable && day < today) state = 'missed'
    else state = trainable ? 'planned' : 'rest'
    if (state === 'missed') missed++

    return { day, dayId, state, trainable, isToday, isPast: day < today }
  })

  return { weekStart, weekEnd: days[6], done, planned, missed, cells }
}

/**
 * Lo que necesita el mensaje de reencuadre de un día perdido (#809): «Te
 * saltaste el lunes. No pasa nada…». `null` cuando no toca decir nada:
 * - no hay días perdidos esta semana;
 * - hoy ya hay actividad (hecha o en curso): ya ha vuelto, no hace falta empujar.
 *
 * El tono no habla de racha a propósito: la racha es semanal y perdona días
 * sueltos (#801), así que un día perdido no la pone en peligro por sí solo.
 */
export interface MissedDaysNote {
  /** Días perdidos, de lunes a domingo. */
  days: WeekCell[]
  /** El más reciente: el que se nombra cuando solo hay uno. */
  latest: WeekCell
}

export function getMissedDaysNote(summary: WeekSummary): MissedDaysNote | null {
  const today = summary.cells.find(c => c.isToday)
  if (today && (today.state === 'done' || today.state === 'in_progress')) return null
  const days = summary.cells.filter(c => c.state === 'missed')
  if (days.length === 0) return null
  return { days, latest: days[days.length - 1] }
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

/**
 * Días con actividad de CUALQUIER tipo: los marcadores del `ProgressMap`
 * (`activityDaysFromProgress`) más las sesiones de cardio LIBRE, que no viven
 * ahí. Sin repetidos y ordenados (el último es el día más reciente).
 *
 * `started_at` del cardio es UTC real (a diferencia de `sessions.completed_at`,
 * que es hora de pared), así que se pasa a día local con `utcToLocalDateStr`.
 * Es la única fuente de los días de actividad: Inicio, Entrenar, Progreso y
 * Perfil de web y móvil la usan, para que la tira de la semana y la racha no
 * discrepen entre pantallas.
 */
export function activityDaysFor(
  progress: ProgressMap,
  cardioSessions: ReadonlyArray<{ started_at?: string | null }> = [],
): string[] {
  const days = new Set(activityDaysFromProgress(progress))
  for (const s of cardioSessions) {
    if (!s.started_at) continue
    const day = utcToLocalDateStr(s.started_at)
    if (isDayStr(day)) days.add(day)
  }
  return [...days].sort()
}

/**
 * Atajo para el «X» de un «X de Y»: días distintos con entreno esta semana de
 * calendario (`getWeekSummary(...).done`), sin necesitar el programa.
 *
 * @param extraActivityDays fechas `YYYY-MM-DD` que no viven en el
 *   `ProgressMap`, sobre todo las sesiones de cardio LIBRE. Pásalas solo si la
 *   pantalla ya las tiene cargadas: no hace falta una consulta nueva.
 */
export function getWeekDoneDays(
  today: string,
  progress: ProgressMap,
  extraActivityDays: Iterable<string> = [],
): number {
  return getWeekSummary({
    today,
    activityDays: [...activityDaysFromProgress(progress), ...extraActivityDays],
    weekDays: [],
  }).done
}
