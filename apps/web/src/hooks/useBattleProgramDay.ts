import { useBattleProgramDay as useCoreBattleProgramDay } from '@calistenia/core/hooks/useBattleProgramDay'
import { useWorkoutState, useWorkoutActions } from '../contexts/WorkoutContext'

/** Días del programa activo convertibles a batalla (#882); la lógica vive en core. */
export function useBattleProgramDay() {
  const { activeProgram, weekDays, programProgress } = useWorkoutState()
  const { getWorkout } = useWorkoutActions()
  return useCoreBattleProgramDay({ activeProgram, weekDays, currentPhase: programProgress.currentPhase, getWorkout })
}
