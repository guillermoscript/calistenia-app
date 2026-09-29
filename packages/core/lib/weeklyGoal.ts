/**
 * Objetivo semanal efectivo (#853).
 *
 * `settings.weekly_goal` vale 5 para casi todo el mundo: es el valor por
 * defecto con el que se creó la fila y ninguna pantalla dejaba cambiarlo. Por
 * decisión de producto (épica #852) ese número se IGNORA hasta que alguien lo
 * fija a mano; mientras tanto el objetivo son los días que marca su programa.
 *
 * - `weekly_goal_custom = true` → `weekly_goal` (lo eligió el usuario).
 * - Si no, días entrenables por semana del programa activo.
 * - Sin programa (o con un programa sin días entrenables), 3.
 *
 * La UI que deja cambiarlo (#856 en web, #859 en móvil) guarda `weeklyGoal` y
 * `weeklyGoalCustom: true` a la vez.
 */
import { isTrainableDay } from './training-day'
import type { Settings, WeekDay } from '../types'

/** Objetivo cuando no hay programa del que sacarlo. */
export const DEFAULT_WEEKLY_GOAL = 3

const MIN_GOAL = 1
const MAX_GOAL = 7

function clampGoal(n: number): number {
  return Math.min(MAX_GOAL, Math.max(MIN_GOAL, Math.round(n)))
}

/** Días entrenables (no `rest`) de la semana tipo de un programa. */
export function trainableDaysPerWeek(weekDays: readonly WeekDay[] | null | undefined): number {
  return (weekDays ?? []).filter(isTrainableDay).length
}

/**
 * @param activeProgram los `weekDays` del programa ACTIVO, o `null` sin
 *   programa. Ojo en web: sin programa `weekDays` trae los días del programa
 *   de reserva (`FALLBACK_PHASES`), así que hay que pasar `null`, no esos días.
 */
export function getEffectiveWeeklyGoal(
  settings: Pick<Settings, 'weeklyGoal' | 'weeklyGoalCustom'> | null | undefined,
  activeProgram: { weekDays: readonly WeekDay[] } | null | undefined,
): number {
  const custom = settings?.weeklyGoal
  if (settings?.weeklyGoalCustom === true && typeof custom === 'number' && Number.isFinite(custom) && custom > 0) {
    return clampGoal(custom)
  }
  const programDays = activeProgram ? trainableDaysPerWeek(activeProgram.weekDays) : 0
  return programDays > 0 ? clampGoal(programDays) : DEFAULT_WEEKLY_GOAL
}
