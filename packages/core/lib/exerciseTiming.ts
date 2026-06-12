import type { ExerciseTiming } from '../types'

/**
 * Serializable snapshot of an in-flight timing session.
 * Persisted alongside session progress so timings survive app restarts.
 */
export interface ExerciseTimingState {
  /** Accumulated milliseconds per exercise id (closed intervals only) */
  elapsedMs: Record<string, number>
  /** Display name per exercise id (free sessions may have custom exercises) */
  names: Record<string, string>
  /** Exercise ids in first-seen order, for stable display */
  order: string[]
  /** Exercise currently on screen, or null if none open */
  currentId: string | null
  /** Wall-clock ms when the current exercise became active */
  currentStartedAt: number | null
}

const emptyState = (): ExerciseTimingState => ({
  elapsedMs: {},
  names: {},
  order: [],
  currentId: null,
  currentStartedAt: null,
})

/**
 * Tracks wall-clock time spent on each exercise during a session.
 *
 * Semantics: an exercise "owns" all time from the moment it becomes the
 * active exercise until the next one does — including rests between its
 * own sets and the rest that precedes the next exercise. Re-entering an
 * exercise (prev/next navigation) accumulates onto its previous total.
 *
 * Pure wall-clock logic, no React and no platform APIs, so it is shared
 * verbatim by the web and mobile session players and is trivially testable.
 */
export class ExerciseTimingTracker {
  private state: ExerciseTimingState

  constructor(initial?: ExerciseTimingState | null) {
    this.state = initial ? { ...initial, elapsedMs: { ...initial.elapsedMs }, names: { ...initial.names }, order: [...initial.order] } : emptyState()
  }

  /** Close the open interval (if any) and fold it into the accumulator. */
  private closeCurrent(now: number): void {
    const { currentId, currentStartedAt } = this.state
    if (currentId === null || currentStartedAt === null) return
    const delta = Math.max(0, now - currentStartedAt)
    this.state.elapsedMs[currentId] = (this.state.elapsedMs[currentId] ?? 0) + delta
    this.state.currentId = null
    this.state.currentStartedAt = null
  }

  /** Mark `exercise` as the active one. No-op if it already is. */
  enterExercise(exercise: { id: string; name: string }, now: number = Date.now()): void {
    if (this.state.currentId === exercise.id) return
    this.closeCurrent(now)
    if (!(exercise.id in this.state.elapsedMs)) {
      this.state.order.push(exercise.id)
    }
    this.state.names[exercise.id] = exercise.name
    this.state.currentId = exercise.id
    this.state.currentStartedAt = now
  }

  /** Close the active exercise and return per-exercise totals in first-seen order. */
  finalize(now: number = Date.now()): ExerciseTiming[] {
    this.closeCurrent(now)
    return this.state.order.map(id => ({
      exerciseId: id,
      exerciseName: this.state.names[id] ?? id,
      seconds: Math.round((this.state.elapsedMs[id] ?? 0) / 1000),
    }))
  }

  /** Snapshot for persistence (store inside the persisted session progress). */
  getState(): ExerciseTimingState {
    return { ...this.state, elapsedMs: { ...this.state.elapsedMs }, names: { ...this.state.names }, order: [...this.state.order] }
  }
}

/** One row of the end-of-session per-exercise time breakdown. */
export interface TimingBreakdownRow extends ExerciseTiming {
  /** Bar width 0..100 — share of the longest exercise's time (longest = 100). */
  pct: number
  /** True for the longest exercise(s); drives the highlight. */
  isMax: boolean
}

export interface TimingBreakdown {
  /** Sorted longest-first, capped at `limit`. */
  rows: TimingBreakdownRow[]
  /** Timed exercises beyond `limit` not shown as rows (for a "+N más" label). */
  overflowCount: number
}

/**
 * Shape per-exercise timings for display, identically on web and mobile.
 *
 * Sorts longest-first (the comparison the user cares about — which exercise
 * took longer), caps at `limit`, computes bar percentages, and flags the
 * longest. Returns no rows when there's nothing worth comparing (fewer than
 * two timed exercises, or every exercise at 0s) so callers skip the block with
 * a single `rows.length` check instead of re-deriving guards.
 *
 * Only the rendering primitives (div vs View) differ between platforms; this
 * keeps the data logic in one place.
 */
export const prepareTimingBreakdown = (
  timings: ExerciseTiming[],
  limit: number = Infinity,
): TimingBreakdown => {
  const timed = timings.filter(t => t.seconds > 0)
  if (timed.length < 2) return { rows: [], overflowCount: 0 }
  const sorted = [...timed].sort((a, b) => b.seconds - a.seconds)
  const maxSecs = sorted[0].seconds // > 0, guaranteed by the filter above
  const shown = Number.isFinite(limit) ? sorted.slice(0, limit) : sorted
  return {
    rows: shown.map(t => ({
      ...t,
      pct: Math.round((t.seconds / maxSecs) * 100),
      isMax: t.seconds === maxSecs,
    })),
    overflowCount: sorted.length - shown.length,
  }
}

/** Format seconds as "M:SS" (or "H:MM:SS" past the hour) for stat displays. */
export const formatTimingClock = (seconds: number): string => {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}
