import { useTrainingWeek as useCoreTrainingWeek } from '@calistenia/core/hooks/useTrainingWeek'
import { useWorkoutActions, useWorkoutState } from '@/contexts/WorkoutContext'
import { useAuthUser } from '@/lib/use-auth-user'

/**
 * La «semana» y la racha semanal de Inicio, Progreso y Perfil. La lógica vive
 * en core (`useTrainingWeek`); aquí solo se leen los contextos. `today` se pasa
 * desde Inicio, que lo actualiza al cambiar de día o de zona horaria.
 */
export function useTrainingWeek(today?: string) {
  const { progress, settings, activeProgram, weekDays } = useWorkoutState()
  const { getWeeklyStreak } = useWorkoutActions()
  const user = useAuthUser()
  return useCoreTrainingWeek({ userId: user?.id ?? null, progress, settings, activeProgram, weekDays, streak: getWeeklyStreak(), today })
}
