import { useMemo } from 'react'
import { useCardioSessions } from '@calistenia/core/hooks/useCardioStats'
import { todayStr, utcToLocalDateStr } from '@calistenia/core/lib/dateUtils'
import { activityDaysFromProgress } from '@calistenia/core/lib/weekSummary'
import { getEffectiveWeeklyGoal, trainableDaysPerWeek, DEFAULT_WEEKLY_GOAL } from '@calistenia/core/lib/weeklyGoal'
import { computeWeeklyStreak, weeklyStreakHistory } from '@calistenia/core/lib/weeklyStreak'
import { useWorkoutState } from '../contexts/WorkoutContext'
import { useAuthState } from '../contexts/AuthContext'

/**
 * La «semana» y la racha semanal que enseñan Entrenar, Progreso y Perfil (#856),
 * con las reglas de #853: días distintos con entreno de cualquier tipo contra el
 * objetivo semanal efectivo.
 *
 * Los días salen del `ProgressMap` (incluye los días de cardio y circuito del
 * programa) más las sesiones de cardio LIBRE, que no viven ahí. Las sesiones de
 * cardio comparten query key con `useCardioStats`, así que no hay fetch nuevo.
 */
export function useTrainingWeek() {
  const { progress, settings, activeProgram, weekDays } = useWorkoutState()
  const { userId } = useAuthState()
  const { sessions: cardioSessions } = useCardioSessions(userId ?? null)
  const today = todayStr()

  const activityDays = useMemo(() => {
    const days = new Set(activityDaysFromProgress(progress))
    for (const s of cardioSessions) {
      if (s.started_at) days.add(utcToLocalDateStr(s.started_at))
    }
    return [...days]
  }, [progress, cardioSessions])

  // Sin programa, `weekDays` trae los días del programa de reserva: hay que
  // pasar `null` (ver `getEffectiveWeeklyGoal`).
  const programWeek = activeProgram ? { weekDays } : null
  const goal = getEffectiveWeeklyGoal(settings, programWeek)
  const programDays = activeProgram ? trainableDaysPerWeek(weekDays) : 0
  const programGoal = programDays > 0 ? Math.min(7, programDays) : DEFAULT_WEEKLY_GOAL
  const goalIsCustom = settings?.weeklyGoalCustom === true && goal > 0

  const streak = useMemo(() => computeWeeklyStreak(activityDays, goal, today), [activityDays, goal, today])
  const history = useMemo(() => weeklyStreakHistory(activityDays, goal, today, 10), [activityDays, goal, today])

  return { today, activityDays, goal, goalIsCustom, programGoal, streak, history }
}
