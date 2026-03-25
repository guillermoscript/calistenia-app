import { createContext, useContext, useState, useRef, useCallback, useEffect, type ReactNode } from 'react'
import type { Workout } from '../types'

// ── Types ────────────────────────────────────────────────────────────────────

type SessionSource = 'program' | 'free'
type SessionPhase = 'exercise' | 'rest' | 'note' | 'celebrate'

interface SessionProgress {
  stepIdx: number
  phase: SessionPhase
  setsCount: number
}

interface PersistedStrengthSession {
  workout: Workout
  workoutKey: string
  source: SessionSource
  progress: SessionProgress
  startedAt: number
}

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
  /** Session progress (survives navigation away and back) */
  progress: SessionProgress
  /** Update session progress */
  setProgress: (update: Partial<SessionProgress>) => void
  /** Start a new session — navigates to /session */
  startSession: (workout: Workout, workoutKey: string, source: SessionSource) => void
  /** End the session (completed or discarded) */
  endSession: () => void
  /** Timestamp when the session was started */
  startedAt: number
  /** Optional rest preference hooks passed from the caller */
  getRestForExercise?: (exerciseId: string, defaultRest: number) => number
  setRestForExercise?: (exerciseId: string, seconds: number) => Promise<void>
}

const ActiveSessionContext = createContext<ActiveSessionContextValue | null>(null)

const FREE_QUEUE_KEY = 'calistenia_free_session_queue'
const STORAGE_KEY = 'calistenia_strength_active'
const MAX_SESSION_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours

// ── Persistence helpers ─────────────────────────────────────────────────────

function saveToStorage(data: PersistedStrengthSession) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch { /* quota exceeded — ignore */ }
}

function loadFromStorage(): PersistedStrengthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data: PersistedStrengthSession = JSON.parse(raw)
    // Discard sessions older than 24 hours
    if (Date.now() - data.startedAt > MAX_SESSION_AGE_MS) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    // Basic shape validation
    if (!data.workout || !data.workoutKey || !data.progress) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return data
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return null
  }
}

function clearStorage() {
  try { localStorage.removeItem(STORAGE_KEY) } catch {}
}

// ── Provider ─────────────────────────────────────────────────────────────────

interface ProviderProps {
  children: ReactNode
  getRestForExercise?: (exerciseId: string, defaultRest: number) => number
  setRestForExercise?: (exerciseId: string, seconds: number) => Promise<void>
}

const INITIAL_PROGRESS: SessionProgress = { stepIdx: 0, phase: 'exercise', setsCount: 0 }

// Synchronous restore — first render already has correct state
const restored = loadFromStorage()

export function ActiveSessionProvider({ children, getRestForExercise, setRestForExercise }: ProviderProps) {
  const [isActive, setIsActive] = useState(!!restored)
  const [workout, setWorkout] = useState<Workout | null>(restored?.workout ?? null)
  const [source, setSource] = useState<SessionSource>(restored?.source ?? 'program')
  const [progress, setProgressState] = useState<SessionProgress>(restored?.progress ?? INITIAL_PROGRESS)
  const workoutKeyRef = useRef(restored?.workoutKey ?? '')
  const startedAtRef = useRef(restored?.startedAt ?? 0)

  const setProgress = useCallback((update: Partial<SessionProgress>) => {
    setProgressState(prev => ({ ...prev, ...update }))
  }, [])

  // Persist session envelope on every meaningful state change
  useEffect(() => {
    if (isActive && workout) {
      saveToStorage({
        workout,
        workoutKey: workoutKeyRef.current,
        source,
        progress,
        startedAt: startedAtRef.current,
      })
    }
  }, [isActive, workout, source, progress])

  // Persist on visibility change (user switches apps / locks phone)
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'hidden' && isActive && workout) {
        saveToStorage({
          workout,
          workoutKey: workoutKeyRef.current,
          source,
          progress,
          startedAt: startedAtRef.current,
        })
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [isActive, workout, source, progress])

  const startSession = useCallback((w: Workout, key: string, src: SessionSource) => {
    const now = Date.now()
    workoutKeyRef.current = key
    startedAtRef.current = now
    setWorkout(w)
    setSource(src)
    setProgressState(INITIAL_PROGRESS)
    setIsActive(true)
    // Persist immediately
    saveToStorage({ workout: w, workoutKey: key, source: src, progress: INITIAL_PROGRESS, startedAt: now })
  }, [])

  const endSession = useCallback(() => {
    setIsActive(false)
    setWorkout(null)
    workoutKeyRef.current = ''
    startedAtRef.current = 0
    setProgressState(INITIAL_PROGRESS)
    clearStorage()
    // Clear free session queue if it was a free session
    try { localStorage.removeItem(FREE_QUEUE_KEY) } catch {}
  }, [])

  const value: ActiveSessionContextValue = {
    isActive,
    workout,
    workoutKey: workoutKeyRef.current,
    source,
    exerciseCount: workout?.exercises.length ?? 0,
    progress,
    setProgress,
    startSession,
    endSession,
    startedAt: startedAtRef.current,
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
