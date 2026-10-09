/**
 * Días del programa activo convertibles a batalla (#882). Lo comparten el
 * inicio («Retar a un amigo»), Entrenar y «Crear batalla» de web y móvil: todos
 * tienen que decidir lo mismo, y la decisión es `battleConfigFromProgramDay`.
 *
 * Recibe el estado del entreno como argumentos (core no importa contextos de app).
 */
import { useMemo } from 'react'
import { battleConfigFromProgramDay, type BattleFromDayResult } from '../lib/battle-from-program-day'
import type { Workout, WeekDay } from '../types'

export interface UseBattleProgramDayArgs<P> {
  activeProgram: P | null | undefined
  weekDays: readonly WeekDay[] | null | undefined
  /** Fase en curso (`programProgress.currentPhase`); 0/undefined = 1. */
  currentPhase: number | null | undefined
  getWorkout: (phase: number, dayId: string) => Workout | null
}

export function useBattleProgramDay<P>({ activeProgram, weekDays, currentPhase: phaseArg, getWorkout }: UseBattleProgramDayArgs<P>) {
  const currentPhase = phaseArg || 1

  return useMemo(() => {
    const days: readonly WeekDay[] = weekDays ?? []
    const convert = (dayId: string, opts: { rounds?: number; phase?: number } = {}): BattleFromDayResult | null => {
      const weekDay = days.find(d => d.id === dayId)
      if (!activeProgram || !weekDay) return null
      const workout = getWorkout(opts.phase ?? currentPhase, dayId)
      if (!workout) return { ok: false, reason: weekDay.type === 'rest' ? 'rest' : 'no_strength_exercises' }
      return battleConfigFromProgramDay({ type: weekDay.type, exercises: workout.exercises }, { rounds: opts.rounds })
    }
    /** Título sugerido del día: el del entreno, o su foco. */
    const dayTitle = (dayId: string, phase?: number): string => {
      const weekDay = days.find(d => d.id === dayId)
      return getWorkout(phase ?? currentPhase, dayId)?.title || weekDay?.focus || weekDay?.name || ''
    }
    return { activeProgram, weekDays: days, currentPhase, convert, dayTitle }
  }, [activeProgram, weekDays, currentPhase, getWorkout])
}
