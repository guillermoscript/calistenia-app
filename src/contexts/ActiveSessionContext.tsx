import { createContext, useContext, useState, useRef, useCallback, type ReactNode } from 'react'
import type { Workout } from '../types'

// ── Types ────────────────────────────────────────────────────────────────────

type SessionSource = 'program' | 'free'

interface ActiveSessionContextValue {
  /** Whether a session is currently active */
  isActive: boolean
  /** The workout being performed */
  workout: Workout | null
  /** Unique key for this session (e.g., "p1_lun" or "free_1234567890") */
  workoutKey: string
  /** Where the session was started from */
  source: SessionSource
  /** Number of exercises in the session */
  exerciseCount: number
  /** Start a new session — navigates to /session */
  startSession: (workout: Workout, workoutKey: string, source: SessionSource) => void
  /** End the session (completed or discarded) */
  endSession: () => void
  /** Optional rest preference hooks passed from the caller */
  getRestForExercise?: (exerciseId: string, defaultRest: number) => number
  setRestForExercise?: (exerciseId: string, seconds: number) => Promise<void>
}

const ActiveSessionContext = createContext<ActiveSessionContextValue | null>(null)

const FREE_QUEUE_KEY = 'calistenia_free_session_queue'

// ── Provider ─────────────────────────────────────────────────────────────────

interface ProviderProps {
  children: ReactNode
  getRestForExercise?: (exerciseId: string, defaultRest: number) => number
  setRestForExercise?: (exerciseId: string, seconds: number) => Promise<void>
}

export function ActiveSessionProvider({ children, getRestForExercise, setRestForExercise }: ProviderProps) {
  const [isActive, setIsActive] = useState(false)
  const [workout, setWorkout] = useState<Workout | null>(null)
  const [source, setSource] = useState<SessionSource>('program')
  const workoutKeyRef = useRef('')

  const startSession = useCallback((w: Workout, key: string, src: SessionSource) => {
    workoutKeyRef.current = key
    setWorkout(w)
    setSource(src)
    setIsActive(true)
  }, [])

  const endSession = useCallback(() => {
    setIsActive(false)
    setWorkout(null)
    workoutKeyRef.current = ''
    // Clear free session queue if it was a free session
    try { localStorage.removeItem(FREE_QUEUE_KEY) } catch {}
  }, [])

  const value: ActiveSessionContextValue = {
    isActive,
    workout,
    workoutKey: workoutKeyRef.current,
    source,
    exerciseCount: workout?.exercises.length ?? 0,
    startSession,
    endSession,
    getRestForExercise,
    setRestForExercise,
  }

  return (
    <ActiveSessionContext.Provider value={value}>
      {children}
    </ActiveSessionContext.Provider>
  )
}

export function useActiveSession() {
  const ctx = useContext(ActiveSessionContext)
  if (!ctx) throw new Error('useActiveSession must be used within ActiveSessionProvider')
  return ctx
}
