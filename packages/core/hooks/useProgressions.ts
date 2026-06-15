import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'
import type { ExerciseProgression, ExerciseLog } from '../types'

// ─── PB → frontend field mapping ───────────────────────────────────────────

function mapRecord(rec: any): ExerciseProgression {
  return {
    id: rec.id,
    exerciseId: rec.exercise_id,
    exerciseName: rec.exercise_name,
    category: rec.category,
    difficultyOrder: rec.difficulty_order,
    nextExerciseId: rec.next_exercise_id || undefined,
    prevExerciseId: rec.prev_exercise_id || undefined,
    targetRepsToAdvance: rec.target_reps_to_advance ?? 12,
    sessionsAtTarget: rec.sessions_at_target ?? 3,
  }
}

export type ProgressionChains = Record<string, ExerciseProgression[]>

interface UseProgressionsReturn {
  chains: ProgressionChains
  allProgressions: ExerciseProgression[]
  loading: boolean
  getChainForExercise: (exerciseId: string) => ExerciseProgression[]
  shouldSuggestProgression: (exerciseId: string, logs: ExerciseLog[]) => boolean
}

/**
 * Progresiones de ejercicios. Datos estáticos globales — se cargan una sola
 * vez y no expiran (staleTime: Infinity). Sin userId; cualquier usuario ve el
 * mismo catálogo. Forma pública estable:
 * { chains, allProgressions, loading, getChainForExercise, shouldSuggestProgression }.
 */
export function useProgressions(): UseProgressionsReturn {
  const { data, isLoading } = useQuery({
    queryKey: qk.progressions,
    // Datos de catálogo: nunca se vuelven stale en memoria — el servidor rara vez
    // los cambia, y el gcTime del QueryClient persiste el caché entre montajes.
    staleTime: Infinity,
    queryFn: async () => {
      const res = await pb.collection('exercise_progressions').getList(1, 200, {
        sort: 'category,difficulty_order',
      })

      const mapped = res.items.map(mapRecord)

      // Agrupar por categoría y ordenar por difficulty_order dentro de cada cadena
      const grouped: ProgressionChains = {}
      for (const prog of mapped) {
        if (!grouped[prog.category]) grouped[prog.category] = []
        grouped[prog.category].push(prog)
      }
      for (const cat of Object.keys(grouped)) {
        grouped[cat].sort((a, b) => a.difficultyOrder - b.difficultyOrder)
      }

      return { allProgressions: mapped, chains: grouped }
    },
  })

  const allProgressions = data?.allProgressions ?? []
  const chains = data?.chains ?? {}

  const getChainForExercise = useCallback((exerciseId: string): ExerciseProgression[] => {
    // Busca la categoría del ejercicio y devuelve su cadena completa
    const prog = allProgressions.find(p => p.exerciseId === exerciseId)
    if (!prog) return []
    return chains[prog.category] || []
  }, [allProgressions, chains])

  const shouldSuggestProgression = useCallback((exerciseId: string, logs: ExerciseLog[]): boolean => {
    const prog = allProgressions.find(p => p.exerciseId === exerciseId)
    if (!prog || !prog.nextExerciseId) return false

    const { targetRepsToAdvance, sessionsAtTarget } = prog

    // Últimas N sesiones con sets, ordenadas de más reciente a más antigua
    const sortedLogs = [...logs]
      .filter(l => l.exerciseId === exerciseId && l.sets?.length > 0)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, sessionsAtTarget)

    if (sortedLogs.length < sessionsAtTarget) return false

    // Todas las sesiones deben tener al menos un set con reps >= target
    return sortedLogs.every(log => {
      return log.sets.some(s => {
        const reps = parseInt(s.reps, 10)
        return !isNaN(reps) && reps >= targetRepsToAdvance
      })
    })
  }, [allProgressions])

  return {
    chains,
    allProgressions,
    loading: isLoading,
    getChainForExercise,
    shouldSuggestProgression,
  }
}
