import { useMemo } from 'react'
import type { ProgressMap, ExerciseLog, SessionDone } from '../types'
import type { TranslatableField } from '../lib/i18n-db'

export interface SessionSet {
  setNumber: number
  reps: string
  weight?: number
  rpe?: number
  note?: string
  loggedAt: number
}

export interface SessionExercise {
  exerciseId: string
  name: TranslatableField
  muscles: TranslatableField
  sets: SessionSet[]
  bestSet: SessionSet | null
  hasWeight: boolean
  hasRpe: boolean
  hasNotes: boolean
}

interface SessionDetailResult {
  session: {
    workoutKey: string
    date: string
    note?: string
    warmupCompleted?: boolean
    warmupSkipped?: boolean
    warmupDurationSeconds?: number
    cooldownCompleted?: boolean
    cooldownSkipped?: boolean
    cooldownDurationSeconds?: number
  } | null
  exercises: SessionExercise[]
}

/**
 * Extracts session detail from the existing ProgressMap.
 * No extra PB queries needed — useProgress already loads all data.
 */
export function useSessionDetail(
  progress: ProgressMap,
  date: string,
  workoutKey: string,
  exerciseCatalog: Record<string, { name: TranslatableField; muscles: TranslatableField }>,
): SessionDetailResult {
  return useMemo(() => {
    // 1. Find session metadata
    const sessionKey = `done_${date}_${workoutKey}`
    const sessionEntry = progress[sessionKey] as SessionDone | undefined
    if (!sessionEntry?.done) {
      return { session: null, exercises: [] }
    }

    const session = {
      workoutKey: sessionEntry.workoutKey,
      date: sessionEntry.date,
      note: sessionEntry.note || undefined,
      warmupCompleted: sessionEntry.warmupCompleted,
      warmupSkipped: sessionEntry.warmupSkipped,
      warmupDurationSeconds: sessionEntry.warmupDurationSeconds,
      cooldownCompleted: sessionEntry.cooldownCompleted,
      cooldownSkipped: sessionEntry.cooldownSkipped,
      cooldownDurationSeconds: sessionEntry.cooldownDurationSeconds,
    }

    // 2. Find all exercise logs for this date + workoutKey
    const exerciseMap = new Map<string, SessionSet[]>()

    Object.entries(progress).forEach(([key, val]) => {
      // ExerciseLog keys are formatted as: {date}_{workoutKey}_{exerciseId}
      if (key.startsWith('done_')) return
      const log = val as ExerciseLog
      if (!log.sets || log.date !== date || log.workoutKey !== workoutKey) return

      const sets: SessionSet[] = log.sets.map((s, i) => ({
        setNumber: i + 1,
        reps: s.reps,
        weight: s.weight,
        rpe: s.rpe,
        note: s.note || undefined,
        loggedAt: s.timestamp,
      }))

      exerciseMap.set(log.exerciseId, sets)
    })

    // 3. Build exercise list with metadata
    const exercises: SessionExercise[] = Array.from(exerciseMap.entries()).map(
      ([exerciseId, sets]) => {
        const catalog = exerciseCatalog[exerciseId]
        const hasWeight = sets.some(s => s.weight != null && s.weight > 0)
        const hasRpe = sets.some(s => s.rpe != null && s.rpe > 0)
        const hasNotes = sets.some(s => s.note != null && s.note.length > 0)

        // Best set: highest numeric reps (skip non-numeric like "max")
        let bestSet: SessionSet | null = null
        let bestReps = -1
        for (const s of sets) {
          const n = parseInt(s.reps)
          if (!isNaN(n) && n > bestReps) {
            bestReps = n
            bestSet = s
          }
        }

        return {
          exerciseId,
          name: catalog?.name || exerciseId,
          muscles: catalog?.muscles || '',
          sets,
          bestSet,
          hasWeight,
          hasRpe,
          hasNotes,
        }
      },
    )

    // Sort exercises by first set timestamp (order performed)
    exercises.sort((a, b) => (a.sets[0]?.loggedAt || 0) - (b.sets[0]?.loggedAt || 0))

    return { session, exercises }
  }, [progress, date, workoutKey, exerciseCatalog])
}
