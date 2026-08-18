import { createContext, useContext, useState, useRef, useCallback, useEffect, useMemo, type ReactNode } from 'react'
import type { Exercise, Workout } from '@calistenia/core/types'
import { op } from '@calistenia/core/lib/analytics'
import type { ExerciseTimingState } from '@calistenia/core/lib/exerciseTiming'
import { pb } from '@calistenia/core/lib/pocketbase'
import { FREE_SESSION_QUEUE_KEY as FREE_QUEUE_KEY, STRENGTH_ACTIVE_KEY as STORAGE_KEY } from '@calistenia/core/lib/storage-keys'
import {
  scheduleActiveSessionPush, flushActiveSessionPush, pushActiveSessionNow,
  fetchRemoteActiveSession, clearRemoteActiveSession,
} from '@calistenia/core/lib/activeSessionSync'

// ── Types ────────────────────────────────────────────────────────────────────

type SessionSource = 'program' | 'free'
type SessionPhase = 'exercise' | 'rest' | 'note' | 'celebrate' | 'section-transition'

interface SessionProgress {
  stepIdx: number
  phase: SessionPhase
  setsCount: number
  /** Serializable timing snapshot — persisted to localStorage so timings survive app restarts */
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
  /** Último guardado local — para decidir si la copia del server es más reciente */
  savedAt?: number
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
  /**
   * Lee el progreso persistido SIN suscribirse a él. `SessionView` lo usa una
   * sola vez, al montar, para restaurar su reducer; suscribirse volvería a
   * re-renderizar media app en cada serie (#475).
   */
  getProgressSnapshot: () => SessionProgress
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
  /** Se incrementa al adoptar una sesión del server — remonta SessionView */
  resumeEpoch: number
  /** Optional rest preference hooks passed from the caller */
  getRestForExercise?: (exerciseId: string, defaultRest: number) => number
  setRestForExercise?: (exerciseId: string, seconds: number) => Promise<void>
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function getCurrentSection(exercises: Exercise[], stepIdx: number): 'warmup' | 'main' | 'cooldown' {
  if (!exercises[stepIdx]) return 'main'
  return exercises[stepIdx].section || 'main'
}

// Dos contextos a propósito: el *store* (identidad de la sesión y acciones) es
// estable durante todo el entreno, mientras que el progreso cambia en cada
// serie. Antes iban juntos en un único value SIN memoizar, así que registrar
// una serie re-renderizaba a todos los consumidores — la barra de sesión, la
// burbuja de sesión libre y `App` — ninguno de los cuales lee el progreso.
const ActiveSessionContext = createContext<ActiveSessionContextValue | null>(null)
const ActiveSessionProgressContext = createContext<SessionProgress | null>(null)

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
  const savedAtRef = useRef(restored?.savedAt ?? restored?.startedAt ?? 0)
  const isActiveRef = useRef(!!restored)
  const [resumeEpoch, setResumeEpoch] = useState(0)

  // Transient warmup/cooldown metadata — refs because they don't drive UI,
  // only read once at session end via getWarmupCooldownData().
  const warmupSkippedRef = useRef(false)
  const warmupDurationRef = useRef(0)
  const cooldownSkippedRef = useRef(false)
  const cooldownDurationRef = useRef(0)

  // Espejo del progreso actualizado EN RENDER (no en un efecto): `SessionView`
  // lo lee durante su primer render, antes de que corra ningún efecto.
  const progressRef = useRef(progress)
  progressRef.current = progress

  const getProgressSnapshot = useCallback(() => progressRef.current, [])

  const setProgress = useCallback((update: Partial<SessionProgress>) => {
    setProgressState(prev => ({ ...prev, ...update }))
  }, [])

  // Persist session on state change and visibility change (single effect)
  useEffect(() => {
    if (!isActive || !workout) return

    const persist = () => {
      savedAtRef.current = Date.now()
      const data = {
        workout,
        workoutKey: workoutKeyRef.current,
        source,
        progress,
        startedAt: startedAtRef.current,
        sectionStartTime,
        savedAt: savedAtRef.current,
      }
      saveToStorage(data)
      scheduleActiveSessionPush({ ...data, platform: 'web' })
    }

    persist()

    const handler = () => {
      if (document.visibilityState === 'hidden') { persist(); flushActiveSessionPush() }
    }
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
    isActiveRef.current = true
    savedAtRef.current = now
    const data = { workout: w, workoutKey: key, source: src, progress: INITIAL_PROGRESS, startedAt: now, sectionStartTime: now, savedAt: now }
    saveToStorage(data)
    pushActiveSessionNow({ ...data, platform: 'web' })
  }, [])

  // Adopción de la sesión activa del server (reanudar entre dispositivos).
  // Solo al arrancar, cuando haya auth: si el server tiene una sesión más
  // reciente que la copia local (o no hay local), se adopta y se remonta
  // SessionView vía resumeEpoch.
  useEffect(() => {
    let cancelled = false
    const tryAdopt = async () => {
      const remote = await fetchRemoteActiveSession<Workout, SessionProgress>()
      if (cancelled || !remote) return
      if (isActiveRef.current) {
        // Sesión local en marcha: solo adoptar si es LA MISMA y el server va por delante
        if (remote.workoutKey !== workoutKeyRef.current) return
        if (remote.savedAt <= savedAtRef.current) return
      }
      workoutKeyRef.current = remote.workoutKey
      startedAtRef.current = remote.startedAt
      savedAtRef.current = remote.savedAt
      isActiveRef.current = true
      setWorkout(remote.workout)
      setSource(remote.source)
      setProgressState(remote.progress)
      setSectionStartTime(remote.sectionStartTime)
      setIsActive(true)
      setResumeEpoch(n => n + 1)
      saveToStorage({
        workout: remote.workout, workoutKey: remote.workoutKey, source: remote.source,
        progress: remote.progress, startedAt: remote.startedAt,
        sectionStartTime: remote.sectionStartTime, savedAt: remote.savedAt,
      })
    }
    if (pb.authStore.isValid) tryAdopt()
    const unsubAuth = pb.authStore.onChange(() => {
      if (pb.authStore.isValid) tryAdopt()
    })
    // Re-chequear al volver a la pestaña: quizá se avanzó en otro dispositivo
    const onVisible = () => {
      if (document.visibilityState === 'visible' && pb.authStore.isValid) tryAdopt()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      unsubAuth()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const getWarmupCooldownData = useCallback((): WarmupCooldownData => ({
    warmupSkipped: warmupSkippedRef.current,
    warmupDurationSeconds: warmupDurationRef.current,
    cooldownSkipped: cooldownSkippedRef.current,
    cooldownDurationSeconds: cooldownDurationRef.current,
  }), [])

  // Estos dos solo REGISTRAN la metadata de la sección saltada. Quién avanza
  // el paso y la fase es `SessionView`, que es el dueño del estado: antes lo
  // escribían los dos y coincidían por casualidad, porque recorrían la misma
  // lista de `buildSteps` por separado (#475). Es también lo que ya hacía la
  // app nativa, así que las dos plataformas vuelven a comportarse igual.
  const skipWarmup = useCallback(() => {
    if (!workout) return
    warmupSkippedRef.current = true
    if (sectionStartTime) {
      warmupDurationRef.current = Math.round((Date.now() - sectionStartTime) / 1000)
    }
    setSectionStartTime(Date.now())
  }, [workout, sectionStartTime])

  const skipCooldown = useCallback(() => {
    if (!workout) return
    cooldownSkippedRef.current = true
    if (sectionStartTime) {
      cooldownDurationRef.current = Math.round((Date.now() - sectionStartTime) / 1000)
    }
  }, [workout, sectionStartTime])

  const skipRemainingCooldown = useCallback(() => {
    skipCooldown()
  }, [skipCooldown])

  const endSession = useCallback(() => {
    isActiveRef.current = false
    clearRemoteActiveSession()
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

  const value: ActiveSessionContextValue = useMemo(() => ({
    isActive,
    workout,
    workoutKey: workoutKeyRef.current,
    source,
    exerciseCount: workout?.exercises.length ?? 0,
    getProgressSnapshot,
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
    resumeEpoch,
    getRestForExercise,
    setRestForExercise,
  }), [
    isActive, workout, source, sectionStartTime, resumeEpoch,
    getProgressSnapshot, setProgress, startSession, endSession,
    getWarmupCooldownData, skipWarmup, skipCooldown, skipRemainingCooldown,
    getRestForExercise, setRestForExercise,
  ])

  return (
    <ActiveSessionContext.Provider value={value}>
      <ActiveSessionProgressContext.Provider value={progress}>
        {children}
      </ActiveSessionProgressContext.Provider>
    </ActiveSessionContext.Provider>
  )
}

export function useActiveSession() {
  const ctx = useContext(ActiveSessionContext)
  if (!ctx) throw new Error('useActiveSession must be used within ActiveSessionProvider')
  return ctx
}

/**
 * Progreso vivo de la sesión. Suscribirse aquí re-renderiza en CADA serie, así
 * que úsalo solo si de verdad necesitas el valor actual; para restaurar al
 * montar está `getProgressSnapshot()` de `useActiveSession()`.
 */
export function useActiveSessionProgress() {
  const ctx = useContext(ActiveSessionProgressContext)
  if (!ctx) throw new Error('useActiveSessionProgress must be used within ActiveSessionProvider')
  return ctx
}
