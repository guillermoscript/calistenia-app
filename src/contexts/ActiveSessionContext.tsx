import { createContext, useContext, useState, useRef, useCallback, useEffect, useMemo, type ReactNode } from 'react'
import type { Exercise, Workout } from '../types'
import { op } from '../lib/analytics'

// ── Types ────────────────────────────────────────────────────────────────────

type SessionSource = 'program' | 'free'
type SessionPhase = 'exercise' | 'rest' | 'note' | 'celebrate' | 'section-transition'

interface SessionProgress {
  stepIdx: number
  phase: SessionPhase
  setsCount: number
}

export interface WarmupCooldownData {
  warmupSkipped: boolean
  warmupDurationSeconds: number
  cooldownSkipped: boolean
  cooldownDurationSeconds: number
}

interface PersistedStrengthSession {
  workout: Workout
  workoutKey: string
  source: SessionSource
  progress: SessionProgress
  startedAt: number
  sectionStartTime: number | null
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
  /** Timestamp when the current section started */
  sectionStartTime: number | null
  /** Set the section start time */
  setSectionStartTime: (time: number | null) => void
  /** Get warmup/cooldown tracking data */
  getWarmupCooldownData: () => WarmupCooldownData
  /** Skip warmup — jump to first main exercise */
  skipWarmup: () => void
  /** Skip cooldown — jump to celebrate */
  skipCooldown: () => void
  /** Skip remaining cooldown exercises */
  skipRemainingCooldown: () => void
  /** Optional rest preference hooks passed from the caller */
  getRestForExercise?: (exerciseId: string, defaultRest: number) => number
  setRestForExercise?: (exerciseId: string, seconds: number) => Promise<void>
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function getCurrentSection(exercises: Exercise[], stepIdx: number): 'warmup' | 'main' | 'cooldown' {
  if (!exercises[stepIdx]) return 'main'
  return exercises[stepIdx].section || 'main'
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
  const [sectionStartTime, setSectionStartTime] = useState<number | null>(restored?.sectionStartTime ?? null)
  const workoutKeyRef = useRef(restored?.workoutKey ?? '')
  const startedAtRef = useRef(restored?.startedAt ?? 0)

  // Transient warmup/cooldown metadata — refs because they don't drive UI,
  // only read once at session end via getWarmupCooldownData().
  const warmupSkippedRef = useRef(false)
  const warmupDurationRef = useRef(0)
  const cooldownSkippedRef = useRef(false)
  const cooldownDurationRef = useRef(0)

  const setProgress = useCallback((update: Partial<SessionProgress>) => {
    setProgressState(prev => ({ ...prev, ...update }))
  }, [])

  // Persist session on state change and visibility change (single effect)
  useEffect(() => {
    if (!isActive || !workout) return

    const persist = () => saveToStorage({
      workout,
      workoutKey: workoutKeyRef.current,
      source,
      progress,
      startedAt: startedAtRef.current,
      sectionStartTime,
    })

    persist()

    const handler = () => { if (document.visibilityState === 'hidden') persist() }
    document.addEventListener('visibilitychange', handler)

    // Track session abandonment when closing/navigating away mid-session
    const abandonHandler = () => {
      if (isActive && workoutKeyRef.current) {
        const elapsed = Math.round((Date.now() - startedAtRef.current) / 1000)
        op.track('workout_abandoned', { workout_key: workoutKeyRef.current, source, duration_seconds: elapsed })
      }
    }
    window.addEventListener('beforeunload', abandonHandler)

    return () => {
      document.removeEventListener('visibilitychange', handler)
      window.removeEventListener('beforeunload', abandonHandler)
    }
  }, [isActive, workout, source, progress, sectionStartTime])

  const startSession = useCallback((w: Workout, key: string, src: SessionSource) => {
    const now = Date.now()
    workoutKeyRef.current = key
    startedAtRef.current = now
    setWorkout(w)
    setSource(src)
    setProgressState(INITIAL_PROGRESS)
    setSectionStartTime(now)
    warmupSkippedRef.current = false
    warmupDurationRef.current = 0
    cooldownSkippedRef.current = false
    cooldownDurationRef.current = 0
    setIsActive(true)
    op.track('session_started', { workout_key: key, source: src })
    // Persist immediately
    saveToStorage({ workout: w, workoutKey: key, source: src, progress: INITIAL_PROGRESS, startedAt: now, sectionStartTime: now })
  }, [])

  const getWarmupCooldownData = useCallback((): WarmupCooldownData => ({
    warmupSkipped: warmupSkippedRef.current,
    warmupDurationSeconds: warmupDurationRef.current,
    cooldownSkipped: cooldownSkippedRef.current,
    cooldownDurationSeconds: cooldownDurationRef.current,
  }), [])

  // Memoized flat step list — avoids rebuilding on every skip call
  const flatSteps = useMemo(() => {
    if (!workout) return []
    const steps: { exercise: Exercise }[] = []
    workout.exercises.forEach(ex => {
      const total = ex.sets === 'múltiples' ? 3 : (parseInt(String(ex.sets)) || 1)
      for (let s = 1; s <= total; s++) steps.push({ exercise: ex })
    })
    return steps
  }, [workout])

  const skipWarmup = useCallback(() => {
    if (!workout) return
    warmupSkippedRef.current = true
    if (sectionStartTime) {
      warmupDurationRef.current = Math.round((Date.now() - sectionStartTime) / 1000)
    }
    const firstMainIdx = flatSteps.findIndex(s => (s.exercise.section || 'main') !== 'warmup')
    const targetIdx = firstMainIdx >= 0 ? firstMainIdx : 0
    setSectionStartTime(Date.now())
    setProgressState(prev => ({ ...prev, stepIdx: targetIdx, phase: 'exercise' }))
  }, [workout, sectionStartTime, flatSteps])

  const skipCooldown = useCallback(() => {
    if (!workout) return
    cooldownSkippedRef.current = true
    if (sectionStartTime) {
      cooldownDurationRef.current = Math.round((Date.now() - sectionStartTime) / 1000)
    }
    setProgressState(prev => ({ ...prev, phase: 'note' }))
  }, [workout, sectionStartTime])

  const skipRemainingCooldown = useCallback(() => {
    skipCooldown()
  }, [skipCooldown])

  const endSession = useCallback(() => {
    setIsActive(false)
    setWorkout(null)
    workoutKeyRef.current = ''
    startedAtRef.current = 0
    setSectionStartTime(null)
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
    sectionStartTime,
    setSectionStartTime,
    getWarmupCooldownData,
    skipWarmup,
    skipCooldown,
    skipRemainingCooldown,
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
