/**
 * Racha SEMANAL: semanas seguidas cumpliendo el objetivo (#853, épica #852).
 *
 * Sustituye a la racha de días en toda la app. Es la versión de cliente; la de
 * servidor (`user_stats`, #801) tiene que dar exactamente lo mismo, y para eso
 * las dos pasan los casos de `__fixtures__/weekly-streak.json`. Si cambias una
 * regla aquí, cambia el fixture y avisa en #801.
 *
 * Reglas:
 * - Semana de calendario, de lunes a domingo (`calendarWeek.ts`).
 * - Cuentan DÍAS distintos con entreno de cualquier tipo (fuerza, yoga, cardio,
 *   circuito o sesión libre). Días repetidos, fechas inválidas y fechas
 *   posteriores a `today` se ignoran.
 * - Una semana se cumple si sus días con entreno llegan a su objetivo.
 * - La semana en curso suma si ya está cumplida, pero NO rompe la racha
 *   mientras no termine.
 * - El objetivo de una semana es el vigente en su ÚLTIMO día (el domingo, o
 *   `today` para la semana en curso). Por eso un cambio de objetivo o de
 *   programa a mitad de semana se aplica a la semana entera.
 * - Entrenos metidos a posteriori con fecha pasada (reentrada retroactiva)
 *   cuentan en su semana: la racha se recalcula siempre desde las fechas.
 * - El objetivo se acota a 1-7: un 0 no puede dar por cumplida cualquier semana.
 */
import { dayNumber, isDayStr, mondayOf, shiftDay } from './calendarWeek'

/** Hitos de racha en semanas (sustituyen a 7/14/30/60/100 días). */
export const WEEKLY_STREAK_MILESTONES = [4, 8, 12, 26, 52] as const

/**
 * Objetivo de cada semana: un número fijo o una función de la semana.
 * `lastDay` es el domingo, o `today` si la semana está en curso.
 */
export type GoalForWeek = number | ((weekStart: string, lastDay: string) => number)

export interface WeeklyStreak {
  /** Semanas seguidas cumpliendo el objetivo, contando la en curso si ya se cumplió. */
  current: number
  /** La racha más larga de la historia (>= `current`). */
  best: number
  thisWeek: {
    weekStart: string
    done: number
    goal: number
    met: boolean
    /** Entrenos que faltan para cumplir la semana (0 si ya se cumplió). */
    remaining: number
  }
}

function clampGoal(goal: number): number {
  if (!Number.isFinite(goal)) return 1
  return Math.min(7, Math.max(1, Math.round(goal)))
}

export function computeWeeklyStreak(
  doneDates: Iterable<string>,
  goalForWeek: GoalForWeek,
  today: string,
): WeeklyStreak {
  const goalOf = (weekStart: string, lastDay: string) =>
    clampGoal(typeof goalForWeek === 'number' ? goalForWeek : goalForWeek(weekStart, lastDay))

  const currentWeek = mondayOf(today)
  const daysByWeek = new Map<string, Set<string>>()
  let firstWeek: string | null = null
  for (const day of doneDates) {
    if (!isDayStr(day) || day > today) continue
    const week = mondayOf(day)
    let set = daysByWeek.get(week)
    if (!set) daysByWeek.set(week, (set = new Set()))
    set.add(day)
    if (!firstWeek || week < firstWeek) firstWeek = week
  }

  const doneIn = (week: string) => daysByWeek.get(week)?.size ?? 0
  const metIn = (week: string) => {
    const lastDay = week === currentWeek ? today : shiftDay(week, 6)
    return doneIn(week) >= goalOf(week, lastDay)
  }

  const thisGoal = goalOf(currentWeek, today)
  const thisDone = doneIn(currentWeek)
  const thisMet = thisDone >= thisGoal

  // Racha actual: hacia atrás desde la semana pasada; la en curso solo suma.
  let current = thisMet ? 1 : 0
  if (firstWeek) {
    for (let week = shiftDay(currentWeek, -7); week >= firstWeek && metIn(week); week = shiftDay(week, -7)) {
      current++
    }
  }

  // Mejor racha: recorrido completo de semanas, de la primera con entreno a la
  // en curso. La en curso sin cumplir cierra el recorrido sin romper nada.
  let best = current
  if (firstWeek) {
    let run = 0
    const weeks = (dayNumber(currentWeek) - dayNumber(firstWeek)) / 7
    for (let i = 0; i <= weeks; i++) {
      const week = shiftDay(firstWeek, i * 7)
      if (week === currentWeek && !thisMet) break
      run = metIn(week) ? run + 1 : 0
      if (run > best) best = run
    }
  }

  return {
    current,
    best,
    thisWeek: {
      weekStart: currentWeek,
      done: thisDone,
      goal: thisGoal,
      met: thisMet,
      remaining: Math.max(0, thisGoal - thisDone),
    },
  }
}

/** Una semana de la tira de «últimas N semanas» (Progreso, #859). */
export interface WeekResult {
  /** Lunes. */
  weekStart: string
  /** Días distintos con entreno. */
  done: number
  goal: number
  met: boolean
  /** Es la semana en curso: si no está cumplida, aún no cuenta como fallada. */
  current: boolean
}

/**
 * Las últimas `count` semanas, de la más antigua a la en curso (la última),
 * con las mismas reglas que `computeWeeklyStreak`: días distintos, fechas
 * futuras ignoradas y el objetivo vigente en el último día de cada semana.
 */
export function recentWeeks(
  doneDates: Iterable<string>,
  goalForWeek: GoalForWeek,
  today: string,
  count = 10,
): WeekResult[] {
  const currentWeek = mondayOf(today)
  const firstWeek = shiftDay(currentWeek, -7 * (Math.max(1, count) - 1))
  const daysByWeek = new Map<string, Set<string>>()
  for (const day of doneDates) {
    if (!isDayStr(day) || day > today) continue
    const week = mondayOf(day)
    if (week < firstWeek) continue
    let set = daysByWeek.get(week)
    if (!set) daysByWeek.set(week, (set = new Set()))
    set.add(day)
  }

  const out: WeekResult[] = []
  for (let week = firstWeek; week <= currentWeek; week = shiftDay(week, 7)) {
    const current = week === currentWeek
    const lastDay = current ? today : shiftDay(week, 6)
    const goal = clampGoal(typeof goalForWeek === 'number' ? goalForWeek : goalForWeek(week, lastDay))
    const done = daysByWeek.get(week)?.size ?? 0
    out.push({ weekStart: week, done, goal, met: done >= goal, current })
  }
  return out
}

/** Un cambio de objetivo: desde `from` (incluido) el objetivo es `goal`. */
export interface GoalChange {
  from: string
  goal: number
}

/**
 * Construye `goalForWeek` a partir del historial de cambios de objetivo (del
 * usuario o por cambio de programa): el objetivo de una semana es el del último
 * cambio con `from <= lastDay`. Antes del primer cambio vale `fallback`.
 */
export function goalForWeekFromChanges(changes: readonly GoalChange[], fallback: number): GoalForWeek {
  const ordered = changes.filter(c => isDayStr(c.from)).sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0))
  return (_weekStart: string, lastDay: string) => {
    let goal = fallback
    for (const c of ordered) {
      if (c.from <= lastDay) goal = c.goal
      else break
    }
    return goal
  }
}

/**
 * Hito cruzado al pasar de `previous` a `current` semanas de racha (el mayor
 * si se cruzan varios de golpe), o `null`.
 */
export function crossedWeeklyStreakMilestone(previous: number, current: number): number | null {
  let hit: number | null = null
  for (const m of WEEKLY_STREAK_MILESTONES) {
    if (previous < m && current >= m) hit = m
  }
  return hit
}
