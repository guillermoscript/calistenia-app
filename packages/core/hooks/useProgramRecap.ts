/**
 * useProgramRecap — el resumen de cierre del programa activo (#941).
 *
 * Compone lo que ya está en memoria: el `ProgressMap` (que trae TODO
 * `sets_log` del usuario, no solo el del programa) agrupado por identidad
 * resuelta, y las fechas de `programProgress`. No hace consultas propias. El
 * cálculo es la función pura `buildProgramRecap`.
 */

import { useMemo } from 'react'
import { useCatalogIndex } from './useCatalogIndex'
import { buildExerciseResolver, groupLogsByResolvedExercise } from '../lib/exercise-resolver'
import { buildProgramRecap, type ProgramRecap, type RecapExerciseInput } from '../lib/programRecap'
import type { ProgramProgress } from '../lib/programProgress'
import type { ProgressMap, Workout } from '../types'

export interface UseProgramRecapArgs {
  progress: ProgressMap
  getWorkout: (phase: number, dayId: string) => Workout | null
  programProgress: Pick<ProgramProgress, 'startDay' | 'endDay'>
  locale: string
}

export function useProgramRecap({ progress, getWorkout, programProgress, locale }: UseProgramRecapArgs): ProgramRecap {
  const { index } = useCatalogIndex()
  const resolve = useMemo(() => buildExerciseResolver({ index, getWorkout, locale }), [index, getWorkout, locale])
  const { startDay, endDay } = programProgress

  return useMemo(() => {
    const { logs, names } = groupLogsByResolvedExercise(progress, resolve)
    const exercises: RecapExerciseInput[] = Object.entries(logs).map(([key, list]) => ({
      key,
      name: names[key] ?? key,
      isTimer: list.length ? resolve(list[0].exerciseId, list[0].workoutKey ?? '').isTimer : false,
      logs: list,
    }))
    return buildProgramRecap({ exercises, startDay, endDay })
  }, [progress, resolve, startDay, endDay])
}
