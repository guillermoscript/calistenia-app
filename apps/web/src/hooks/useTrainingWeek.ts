import { useTrainingWeek as useCoreTrainingWeek } from '@calistenia/core/hooks/useTrainingWeek'
import { useWorkoutActions, useWorkoutState } from '../contexts/WorkoutContext'
import { useAuthState } from '../contexts/AuthContext'

/**
 * La «semana» y la racha semanal de Entrenar, Progreso y Perfil (#856). La
 * lógica vive en core (`useTrainingWeek`); aquí solo se leen los contextos.
 */
export function useTrainingWeek() {
  const { progress, settings, activeProgram, weekDays } = useWorkoutState()
  const { getWeeklyStreak } = useWorkoutActions()
  const { userId } = useAuthState()
  return useCoreTrainingWeek({ userId: userId ?? null, progress, settings, activeProgram, weekDays, streak: getWeeklyStreak() })
}
