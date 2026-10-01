/**
 * Días del programa activo convertibles a batalla (#882). Lo comparten el inicio
 * («Retar a un amigo»), la pestaña Entrenar y la pantalla de crear batalla: los tres
 * tienen que decidir lo mismo, y la decisión es `battleConfigFromProgramDay` de core.
 */
import { useMemo } from 'react'
import { useWorkoutState, useWorkoutActions } from '@/contexts/WorkoutContext'
import { battleConfigFromProgramDay, type BattleFromDayResult } from '@calistenia/core/lib/battle-from-program-day'

export function useBattleProgramDay() {
  const { activeProgram, weekDays, programProgress } = useWorkoutState()
  const { getWorkout } = useWorkoutActions()
  const currentPhase = programProgress.currentPhase || 1

  return useMemo(() => {
    const convert = (dayId: string, opts: { rounds?: number; phase?: number } = {}): BattleFromDayResult | null => {
      const weekDay = weekDays.find(d => d.id === dayId)
      if (!activeProgram || !weekDay) return null
      const workout = getWorkout(opts.phase ?? currentPhase, dayId)
      if (!workout) return { ok: false, reason: weekDay.type === 'rest' ? 'rest' : 'no_strength_exercises' }
      return battleConfigFromProgramDay({ type: weekDay.type, exercises: workout.exercises }, { rounds: opts.rounds })
    }
    /** Título sugerido del día: el del entreno, o su foco. */
    const dayTitle = (dayId: string, phase?: number): string => {
      const weekDay = weekDays.find(d => d.id === dayId)
      return getWorkout(phase ?? currentPhase, dayId)?.title || weekDay?.focus || weekDay?.name || ''
    }
    return { activeProgram, weekDays, currentPhase, convert, dayTitle }
  }, [activeProgram, weekDays, currentPhase, getWorkout])
}
