/**
 * Workout duration calculation utility.
 */

interface ExerciseDuration {
  sets: number | string
  reps: string
  rest: number
  isTimer?: boolean
  timerSeconds?: number
}

/**
 * Estimate workout duration in minutes for a list of exercises.
 *
 * For each exercise:
 *   - If isTimer: time per set = timerSeconds (or 30s fallback)
 *   - Otherwise: estimate 30s per set for the working portion
 *   - Total = sets * (timePerSet + restSeconds)
 */
export function calculateWorkoutDuration(exercises: ExerciseDuration[]): number {
  let totalSeconds = 0

  for (const ex of exercises) {
    const sets = typeof ex.sets === 'number' ? ex.sets : 3 // fallback for "multiples" etc.
    const timePerSet = ex.isTimer && ex.timerSeconds ? ex.timerSeconds : 30
    const rest = ex.rest || 60

    // sets * working time + (sets - 1) * rest (no rest after last set)
    totalSeconds += sets * timePerSet + Math.max(0, sets - 1) * rest
  }

  return Math.round(totalSeconds / 60)
}

/**
 * Format minutes into a human-readable string.
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}min`
}
