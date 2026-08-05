import { addDays } from './dateUtils'
import { parseRepsForPR } from './pr-utils'

export interface ExpressDay {
  date: string
  value: number
  completed: boolean
}

export interface ExpressProgressStats {
  daysCompleted: number
  totalDays: number
  currentStreak: number
  dailyProgress: ExpressDay[]
}

/**
 * Progreso diario de un reto express: suma de reps del ejercicio por día local
 * contra el objetivo diario.
 *
 * `sets` llegan ya con la fecha local resuelta (sets_log.logged_at es UTC; la
 * conversión con timezone vive en el hook). `reps` es texto libre en el
 * esquema, se parsea con parseRepsForPR. `today` se inyecta para que la
 * función sea pura y testeable.
 *
 * Los días del reto son [starts_at, starts_at + durationDays): createExpress
 * guarda ends_at = starts_at + duration_days, así que ends_at queda fuera.
 * La racha solo se rompe con un día fallado ESTRICTAMENTE anterior a hoy —
 * el día en curso aún puede completarse.
 */
export function computeExpressProgress(
  sets: Array<{ date: string; reps: string | null }>,
  startsAt: string,
  durationDays: number,
  dailyTarget: number,
  today: string,
): ExpressProgressStats {
  const dailyMap = new Map<string, number>()
  for (const s of sets) {
    const n = parseRepsForPR(s.reps)
    if (n != null) dailyMap.set(s.date, (dailyMap.get(s.date) || 0) + n)
  }

  const totalDays = Math.max(0, Math.min(durationDays, 366))
  const dailyProgress: ExpressDay[] = []
  let daysCompleted = 0
  let currentStreak = 0

  for (let i = 0; i < totalDays; i++) {
    const date = i === 0 ? startsAt : addDays(startsAt, i)
    const value = dailyMap.get(date) || 0
    const completed = dailyTarget > 0 && value >= dailyTarget
    dailyProgress.push({ date, value, completed })
    if (date > today) continue
    if (completed) {
      daysCompleted++
      currentStreak++
    } else if (date < today) {
      currentStreak = 0
    }
  }

  return { daysCompleted, totalDays, currentStreak, dailyProgress }
}
