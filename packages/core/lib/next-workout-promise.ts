/**
 * «Vuelve el `<día>`» de la celebración post-entreno (#825).
 *
 * Ninguna de las dos `CelebrateScreen` promete cuándo es el próximo entreno:
 * termina en «ir al home» sin decir cuándo volver, pese a que el onboarding
 * ya guarda un recordatorio (`workout_reminders`) y el programa activo sabe
 * qué días se entrena.
 *
 * Fuente, en orden: el recordatorio de tipo `workout` activo (tiene hora); si
 * no hay uno con días válidos, el programa activo (solo día, sin hora). Sin
 * ninguno de los dos, `null` — no se inventa una fecha.
 *
 * Reutiliza lo que ya existe en vez de reimplementar aritmética de fechas:
 * `summarizeReminderSchedule` (normaliza `days_of_week`, que llega en DOS
 * convenciones distintas según la pantalla que lo guardó — ver ese fichero) y
 * `nextTrainingDay` (siguiente día entrenable del programa). Solo el barrido
 * circular sobre `WEEK_ORDER` para el recordatorio es nuevo, porque
 * `nextTrainingDay` mira `WeekDay.type`, no un conjunto de días sueltos.
 */
import type { DayId, WeekDay } from '../types'
import { WEEK_ORDER, nextTrainingDay } from './training-day'
import { summarizeReminderSchedule, type ReminderScheduleInput } from './push-prompt-copy'

export type NextWorkoutPromise =
  | { source: 'reminder'; dayId: DayId; time: string }
  | { source: 'program'; dayId: DayId }

export interface NextWorkoutPromiseInput {
  /** Día de hoy en hora local (`DAY_BY_INDEX[localDay()]`). */
  todayId: DayId
  /** Recordatorio `workout` activo, o `null`/`undefined` si no hay. */
  reminder?: ReminderScheduleInput | null
  /** Días del programa activo. `null`/vacío si no hay programa activo. */
  weekDays?: readonly WeekDay[] | null
}

/** Primer `DayId` tras `fromId` (sin incluirlo, dando la vuelta) que cumple `matches`. */
function nextMatchingDay(fromId: DayId, matches: (id: DayId) => boolean): DayId | null {
  const start = WEEK_ORDER.indexOf(fromId)
  for (let i = 1; i <= WEEK_ORDER.length; i++) {
    const id = WEEK_ORDER[(start + i) % WEEK_ORDER.length]
    if (matches(id)) return id
  }
  return null
}

export function computeNextWorkoutPromise(input: NextWorkoutPromiseInput): NextWorkoutPromise | null {
  const schedule = summarizeReminderSchedule(input.reminder)
  if (schedule) {
    // `dayShortIndexes` ya está en la convención de `WEEK_ORDER` (0=lunes..6=domingo).
    const days = new Set(schedule.dayShortIndexes.map((i) => WEEK_ORDER[i]))
    const next = nextMatchingDay(input.todayId, (id) => days.has(id))
    if (next) return { source: 'reminder', dayId: next, time: schedule.time }
  }

  if (input.weekDays?.length) {
    const next = nextTrainingDay(input.weekDays, input.todayId)
    if (next) return { source: 'program', dayId: next }
  }

  return null
}
