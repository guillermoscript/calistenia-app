/**
 * useTrainingStats — estadísticas de fuerza (músculos, ejercicios, récords,
 * tendencia) sobre el `progress` que `useProgress` ya tiene en memoria.
 *
 * No hace ningún fetch: recibe `progress` y `getWorkout` del WorkoutContext de
 * cada app (viven en `apps/web` y `apps/mobile`, no aquí) y sólo espera al
 * índice del catálogo para poder nombrar y clasificar los ejercicios. Con
 * `ready === false` devuelve igualmente números (los ejercicios de catálogo
 * caen a «desconocido» hasta que llegue el índice) para que la pantalla pueda
 * pintar skeleton y recalcular sin ramas especiales.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useCatalogIndex } from './useCatalogIndex'
import { buildExerciseResolver } from '../lib/exercise-resolver'
import { computeTrainingStats, type StatsPeriod, type TrainingStats } from '../lib/training-stats'
import { todayStr } from '../lib/dateUtils'
import type { ProgressMap, Workout } from '../types'

export interface UseTrainingStatsResult {
  stats: TrainingStats
  /** `true` cuando el catálogo está indexado y los nombres/músculos son definitivos. */
  ready: boolean
}

export function useTrainingStats(
  progress: ProgressMap,
  getWorkout: (phase: number, dayId: string) => Workout | null,
  period: StatsPeriod,
): UseTrainingStatsResult {
  const { index, ready } = useCatalogIndex()
  const { i18n } = useTranslation()
  const locale = i18n.language

  const stats = useMemo(() => {
    const resolve = buildExerciseResolver({ index, getWorkout, locale })
    return computeTrainingStats({ progress, resolve, period, today: todayStr() })
  }, [progress, getWorkout, index, period, locale])

  return { stats, ready }
}
