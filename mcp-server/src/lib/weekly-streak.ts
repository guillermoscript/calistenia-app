/**
 * Racha de entrenamiento SEMANAL (#801), vista desde el MCP.
 *
 * La racha la mantiene PocketBase (`pb_hooks/utils/workout_stats.js`) en
 * `user_stats`: semanas naturales (lunes a domingo) seguidas con al menos
 * `STREAK_WEEKLY_GOAL` días distintos de entreno, junto con la semana en curso
 * (`streak_week_start`) y sus días como bits (`streak_week_mask`). El MCP NO la
 * recalcula: solo lee `sessions` (no circuitos ni cardio) y, al escribirla, pisaba
 * el estado semanal del hook.
 *
 * Lo único que añade es la caducidad. El hook solo escribe cuando hay un entreno,
 * así que quien deja de entrenar conserva el número guardado. Aquí se aplica la
 * misma regla que el cliente (`packages/core/lib/streak.ts`): la racha está viva
 * si la última semana con entreno es esta, o la anterior y se cumplió.
 */

export const STREAK_WEEKLY_GOAL = 2

export interface WeeklyStreakRow {
  workout_streak_current?: number | null
  workout_streak_best?: number | null
  streak_week_start?: string | null
  streak_week_mask?: number | null
}

function popcount(mask: number): number {
  let n = 0
  for (let i = 0; i < 7; i++) n += (mask >> i) & 1
  return n
}

/** 'YYYY-MM-DD' → lunes de su semana, 'YYYY-MM-DD'. */
export function weekStartOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

function shiftDays(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

/** Racha semanal viva y mejor, a partir de la fila de `user_stats`. */
export function liveWorkoutStreak(
  row: WeeklyStreakRow | null | undefined,
  todayStr: string,
): { current: number; best: number } {
  const best = Math.max(0, Number(row?.workout_streak_best) || 0)
  const stored = Math.max(0, Number(row?.workout_streak_current) || 0)
  const weekStart = row?.streak_week_start || ''
  if (!row || !weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(todayStr)) return { current: 0, best }

  const thisWeek = weekStartOf(todayStr)
  const achieved = popcount(Number(row.streak_week_mask) || 0) >= STREAK_WEEKLY_GOAL
  const alive =
    weekStart === thisWeek || (weekStart === shiftDays(thisWeek, -7) && achieved)
  return { current: alive ? stored : 0, best }
}
