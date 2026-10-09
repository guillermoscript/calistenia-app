import { useMemo } from 'react'
import { todayStr } from '../lib/dateUtils'
import { activityDaysFor } from '../lib/weekSummary'
import { getEffectiveWeeklyGoal, trainableDaysPerWeek, DEFAULT_WEEKLY_GOAL } from '../lib/weeklyGoal'
import type { WorkoutStreak } from './useWorkoutStreak'
import { useCardioSessions } from './useCardioStats'
import type { CardioSession, ProgressMap, Settings, WeekDay } from '../types'

export interface UseTrainingWeekArgs {
  userId: string | null
  progress: ProgressMap
  settings: Settings
  /** Programa activo (o `null`/`undefined`): sin él, `weekDays` es el de reserva. */
  activeProgram: unknown
  weekDays: readonly WeekDay[]
  /** `getWeeklyStreak()` del WorkoutContext: la racha del servidor (#801). */
  streak: WorkoutStreak
  /** Hoy, `YYYY-MM-DD`; por defecto `todayStr()`. Inicio móvil lo pasa con su cambio de día. */
  today?: string
}

/**
 * La «semana» que enseñan Inicio, Entrenar, Progreso y Perfil (#856), con las
 * reglas de #853: días distintos con entreno de cualquier tipo contra el
 * objetivo semanal efectivo. Web y móvil la comparten.
 *
 * - DÍAS: `activityDaysFor` = `ProgressMap` (incluye cardio y circuito del
 *   programa) + TODAS las sesiones de cardio libre. Las sesiones comparten
 *   query key con `useCardioStats`: no hay fetch nuevo.
 * - RACHA e historial: los del servidor (`useWorkoutStreak`), que mira todos los
 *   programas y el historial de objetivos. Una sola fuente para todas las
 *   pantallas; aquí solo se re-exponen.
 */
export function useTrainingWeek({ userId, progress, settings, activeProgram, weekDays, streak, today: todayArg }: UseTrainingWeekArgs) {
  const { sessions: cardioSessions } = useCardioSessions(userId)
  const today = todayArg ?? todayStr()

  const activityDays = useMemo(() => activityDaysFor(progress, cardioSessions), [progress, cardioSessions])

  // Sin programa, `weekDays` trae los días del programa de reserva: hay que
  // pasar `null` (ver `getEffectiveWeeklyGoal`).
  const hasProgram = !!activeProgram
  const goal = getEffectiveWeeklyGoal(settings, hasProgram ? { weekDays: weekDays as WeekDay[] } : null)
  const programDays = hasProgram ? trainableDaysPerWeek(weekDays as WeekDay[]) : 0
  const programGoal = programDays > 0 ? Math.min(7, programDays) : DEFAULT_WEEKLY_GOAL
  const goalIsCustom = settings?.weeklyGoalCustom === true && goal > 0

  return {
    today,
    activityDays,
    cardioSessions: cardioSessions as CardioSession[],
    goal,
    goalIsCustom,
    programGoal,
    streak,
    history: streak.history,
  }
}
