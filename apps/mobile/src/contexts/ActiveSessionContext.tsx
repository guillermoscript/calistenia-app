// Port del ActiveSessionContext de apps/web. Misma arquitectura: SessionView
// es dueño del estado local (stepIdx/phase) y lo empuja aquí; el context nunca
// se lee de vuelta durante la sesión, solo para restaurar tras navegar fuera.
// Cambios vs web: storage de core en vez de localStorage, AppState en vez de
// visibilitychange/beforeunload.
import { createContext, useContext, useState, useRef, useCallback, useEffect, useMemo, type ReactNode } from 'react'
import { AppState } from 'react-native'
import { storage } from '@calistenia/core/platform'
import type { Exercise, Workout } from '@calistenia/core/types'
import { op } from '@calistenia/core/lib/analytics'
import type { ExerciseTimingState } from '@calistenia/core/lib/exerciseTiming'

// ── Types ────────────────────────────────────────────────────────────────────

type SessionSource = 'program' | 'free'
type SessionPhase = 'exercise' | 'rest' | 'note' | 'celebrate' | 'section-transition'

interface SessionProgress {
  stepIdx: number
  phase: SessionPhase
  setsCount: number
  timing?: ExerciseTimingState
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
  isActive: boolean
  workout: Workout | null
  workoutKey: string
  source: SessionSource
  exerciseCount: number
  progress: SessionProgress
  setProgress: (update: Partial<SessionProgress>) => void
  startSession: (workout: Workout, workoutKey: string, source: SessionSource) => void
  endSession: () => void
  startedAt: number
  sectionStartTime: number | null
  setSectionStartTime: (time: number | null) => void
  getWarmupCooldownData: () => WarmupCooldownData
  skipWarmup: () => void
  skipCooldown: () => void
  getRestForExercise?: (exerciseId: string, defaultRest: number) => number
  setRestForExercise?: (exerciseId: string, seconds: number) => Promise<void>
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function getCurrentSection(exercises: Exercise[], stepIdx: number): 'warmup' | 'main' | 'cooldown' {
  if (!exercises[stepIdx]) return 'main'
  return exercises[stepIdx].section || 'main'
}

const ActiveSessionContext = createContext<ActiveSessionContextValue | null>(null)

const STORAGE_KEY = 'calistenia_strength_active'
const MAX_SESSION_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours

// ── Persistence helpers ─────────────────────────────────────────────────────

function saveToStorage(data: PersistedStrengthSession) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch { /* ignore */ }
}

function loadFromStorage(): PersistedStrengthSession | null {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data: PersistedStrengthSession = JSON.parse(raw)
    if (Date.now() - data.startedAt > MAX_SESSION_AGE_MS) {
      storage.removeItem(STORAGE_KEY)
      return null
    }
    if (!data.workout || !data.workoutKey || !data.progress) {
      storage.removeItem(STORAGE_KEY)
      return null
    }
    return data
  } catch {
    storage.removeItem(STORAGE_KEY)
    return null
  }
}

function clearStorage() {
  try { storage.removeItem(STORAGE_KEY) } catch {}
}

// ── Provider ─────────────────────────────────────────────────────────────────

interface ProviderProps {
  children: ReactNode
  getRestForExercise?: (exerciseId: string, defaultRest: number) => number
  setRestForExercise?: (exerciseId: string, seconds: number) => Promise<void>
}

const INITIAL_PROGRESS: SessionProgress = { stepIdx: 0, phase: 'exercise', setsCount: 0 }

export function ActiveSessionProvider({ children, getRestForExercise, setRestForExercise }: ProviderProps) {
  // Restore síncrono — el storage de core ya está hidratado en el boot.
  const restored = useRef(loadFromStorage()).current

  const [isActive, setIsActive] = useState(!!restored)
  const [workout, setWorkout] = useState<Workout | null>(restored?.workout ?? null)
  const [source, setSource] = useState<SessionSource>(restored?.source ?? 'program')
  const [progress, setProgressState] = useState<SessionProgress>(restored?.progress ?? INITIAL_PROGRESS)
  const [sectionStartTime, setSectionStartTime] = useState<number | null>(restored?.sectionStartTime ?? null)
  const workoutKeyRef = useRef(restored?.workoutKey ?? '')
  const startedAtRef = useRef(restored?.startedAt ?? 0)

  // Metadata transitoria de warmup/cooldown — refs porque no pintan UI,
  // solo se leen una vez al cerrar la sesión via getWarmupCooldownData().
  const warmupSkippedRef = useRef(false)
  const warmupDurationRef = useRef(0)
  const cooldownSkippedRef = useRef(false)
  const cooldownDurationRef = useRef(0)

  const setProgress = useCallback((update: Partial<SessionProgress>) => {
    setProgressState(prev => ({ ...prev, ...update }))
  }, [])

  // Persistir en cada cambio y al pasar a background
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

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') persist()
    })
    return () => sub.remove()
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
    op.track('session_started', { workout_key: key, source: src, platform: 'mobile' })
    saveToStorage({ workout: w, workoutKey: key, source: src, progress: INITIAL_PROGRESS, startedAt: now, sectionStartTime: now })
  }, [])

  const getWarmupCooldownData = useCallback((): WarmupCooldownData => ({
    warmupSkipped: warmupSkippedRef.current,
    warmupDurationSeconds: warmupDurationRef.current,
    cooldownSkipped: cooldownSkippedRef.current,
    cooldownDurationSeconds: cooldownDurationRef.current,
  }), [])

  const skipWarmup = useCallback(() => {
    warmupSkippedRef.current = true
    if (sectionStartTime) {
      warmupDurationRef.current = Math.round((Date.now() - sectionStartTime) / 1000)
    }
  }, [sectionStartTime])

  const skipCooldown = useCallback(() => {
    cooldownSkippedRef.current = true
    if (sectionStartTime) {
      cooldownDurationRef.current = Math.round((Date.now() - sectionStartTime) / 1000)
    }
  }, [sectionStartTime])

  const endSession = useCallback(() => {
    setIsActive(false)
    setWorkout(null)
    workoutKeyRef.current = ''
    startedAtRef.current = 0
    setSectionStartTime(null)
    setProgressState(INITIAL_PROGRESS)
    clearStorage()
  }, [])

  const value: ActiveSessionContextValue = useMemo(() => ({
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
    getRestForExercise,
    setRestForExercise,
  }), [isActive, workout, source, progress, setProgress, startSession, endSession, sectionStartTime, getWarmupCooldownData, skipWarmup, skipCooldown, getRestForExercise, setRestForExercise])

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
