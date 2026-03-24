import type { ProgressMap, ExerciseLog } from '../types'

export const isFreeSession = (workoutKey: string | undefined | null): boolean =>
  !!workoutKey && workoutKey.startsWith('free_')

export function filterProgressByType(progress: ProgressMap, type: 'free' | 'program'): ProgressMap {
  return Object.fromEntries(
    Object.entries(progress).filter(([key, val]) => {
      // done_ keys: done_{date}_{workoutKey}
      if (key.startsWith('done_')) {
        const workoutKey = key.split('_').slice(2).join('_')
        return type === 'free' ? isFreeSession(workoutKey) : !isFreeSession(workoutKey)
      }
      // ExerciseLog entries have workoutKey field
      const log = val as ExerciseLog
      if (log.workoutKey) {
        return type === 'free' ? isFreeSession(log.workoutKey) : !isFreeSession(log.workoutKey)
      }
      // Unknown entries: include in program by default
      return type === 'program'
    })
  )
}
