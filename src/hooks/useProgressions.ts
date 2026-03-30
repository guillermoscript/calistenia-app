import { useState, useEffect, useCallback, useRef } from 'react'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
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

export function useProgressions(): UseProgressionsReturn {
  const [allProgressions, setAllProgressions] = useState<ExerciseProgression[]>([])
  const [chains, setChains] = useState<ProgressionChains>({})
  const [loading, setLoading] = useState(true)
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    const load = async () => {
      try {
        const available = await isPocketBaseAvailable()
        if (!available) {
          setLoading(false)
          return
        }

        const res = await pb.collection('exercise_progressions').getList(1, 200, {
          sort: 'category,difficulty_order',
        })

        const mapped = res.items.map(mapRecord)
        setAllProgressions(mapped)

        // Group by category
        const grouped: ProgressionChains = {}
        for (const prog of mapped) {
          if (!grouped[prog.category]) grouped[prog.category] = []
          grouped[prog.category].push(prog)
        }
        // Ensure each chain is sorted by difficulty_order
        for (const cat of Object.keys(grouped)) {
          grouped[cat].sort((a, b) => a.difficultyOrder - b.difficultyOrder)
        }
        setChains(grouped)
      } catch (e) {
        console.warn('Failed to load exercise progressions:', e)
        // Graceful fallback: empty chains
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const getChainForExercise = useCallback((exerciseId: string): ExerciseProgression[] => {
    // Find which category this exercise belongs to
    const prog = allProgressions.find(p => p.exerciseId === exerciseId)
    if (!prog) return []
    return chains[prog.category] || []
  }, [allProgressions, chains])

  const shouldSuggestProgression = useCallback((exerciseId: string, logs: ExerciseLog[]): boolean => {
    const prog = allProgressions.find(p => p.exerciseId === exerciseId)
    if (!prog || !prog.nextExerciseId) return false

    const { targetRepsToAdvance, sessionsAtTarget } = prog

    // Get the most recent N session logs for this exercise, sorted newest first
    const sortedLogs = [...logs]
      .filter(l => l.exerciseId === exerciseId && l.sets?.length > 0)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, sessionsAtTarget)

    if (sortedLogs.length < sessionsAtTarget) return false

    // Check that every session had at least one set meeting the target reps
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
    loading,
    getChainForExercise,
    shouldSuggestProgression,
  }
}
