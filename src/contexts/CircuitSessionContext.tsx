import { createContext, useContext, useState, useRef, useCallback, useEffect, type ReactNode } from 'react'
import type { CircuitDefinition } from '../types'
import { pb } from '../lib/pocketbase'
import { op } from '../lib/analytics'

// ── Types ────────────────────────────────────────────────────────────────────

export interface CircuitProgress {
  currentRound: number          // 0-indexed
  currentExerciseIndex: number  // 0-indexed within the round
  phase: 'exercise' | 'rest' | 'roundRest' | 'work' | 'celebrate'
  completedExercises: number    // total across all rounds
}

interface PersistedCircuitSession {
  circuit: CircuitDefinition
  progress: CircuitProgress
  startedAt: number
  isPaused: boolean
  source: 'custom' | 'preset' | 'program'
  programId?: string
  programDayKey?: string
}

interface CircuitSessionContextType {
  // State
  isActive: boolean
  circuit: CircuitDefinition | null
  progress: CircuitProgress
  startedAt: number | null
  isPaused: boolean
  source: 'custom' | 'preset' | 'program'
  programId?: string
  programDayKey?: string

  // Actions
  startCircuit: (circuit: CircuitDefinition, source: 'custom' | 'preset' | 'program', programId?: string, programDayKey?: string) => void
  advanceExercise: () => void
  advanceToNextPhase: () => void
  pause: () => void
  resume: () => void
  completeCircuit: (note?: string) => Promise<void>
  abandonCircuit: () => void
}

// ── Constants ───────────────────────────────────────────────────────────────

const STORAGE_KEY = 'calistenia_circuit_active'
const MAX_SESSION_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours

const INITIAL_PROGRESS: CircuitProgress = {
  currentRound: 0,
  currentExerciseIndex: 0,
  phase: 'exercise',
  completedExercises: 0,
}

// ── Persistence helpers ─────────────────────────────────────────────────────

function saveToStorage(data: PersistedCircuitSession) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch { /* quota exceeded — ignore */ }
}

function loadFromStorage(): PersistedCircuitSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data: PersistedCircuitSession = JSON.parse(raw)
    if (Date.now() - data.startedAt > MAX_SESSION_AGE_MS) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    if (!data.circuit || !data.progress) {
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

// ── Complete circuit session (PB + analytics) ───────────────────────────────

async function completeCircuitSession(
  userId: string,
  circuit: CircuitDefinition,
  progress: CircuitProgress,
  startedAt: number,
  source: 'custom' | 'preset' | 'program',
  programId?: string,
  programDayKey?: string,
  note?: string,
) {
  const now = Date.now()
  const durationSeconds = Math.round((now - startedAt) / 1000)
  const roundsCompleted = progress.phase === 'celebrate'
    ? circuit.rounds
    : progress.currentRound + 1

  const data: Record<string, unknown> = {
    user: userId,
    circuit_name: circuit.name,
    mode: circuit.mode,
    exercises: circuit.exercises,
    rounds_completed: roundsCompleted,
    rounds_target: circuit.rounds,
    duration_seconds: durationSeconds,
    started_at: new Date(startedAt).toISOString(),
    finished_at: new Date(now).toISOString(),
    note: note || '',
    config: circuit,
  }

  if (programId) data.program = programId
  if (programDayKey) data.program_day_key = programDayKey

  await pb.collection('circuit_sessions').create(data)

  op.track('circuit_completed', {
    mode: circuit.mode,
    rounds_completed: roundsCompleted,
    rounds_target: circuit.rounds,
    exercise_count: circuit.exercises.length,
    duration_seconds: durationSeconds,
    source,
  })
}

// ── Context ─────────────────────────────────────────────────────────────────

const CircuitSessionContext = createContext<CircuitSessionContextType | null>(null)

// Synchronous restore — first render already has correct state
const restored = loadFromStorage()

interface ProviderProps {
  userId: string | null
  children: ReactNode
}

export function CircuitSessionProvider({ userId, children }: ProviderProps) {
  const [isActive, setIsActive] = useState(!!restored)
  const [circuit, setCircuit] = useState<CircuitDefinition | null>(restored?.circuit ?? null)
  const [progress, setProgress] = useState<CircuitProgress>(restored?.progress ?? INITIAL_PROGRESS)
  const [isPaused, setIsPaused] = useState(restored?.isPaused ?? false)
  const [source, setSource] = useState<'custom' | 'preset' | 'program'>(restored?.source ?? 'custom')

  const startedAtRef = useRef(restored?.startedAt ?? 0)
  const programIdRef = useRef(restored?.programId)
  const programDayKeyRef = useRef(restored?.programDayKey)

  // ── Persistence on state change + visibilitychange ──────────────────────

  useEffect(() => {
    if (!isActive || !circuit) return

    const persist = () => saveToStorage({
      circuit,
      progress,
      startedAt: startedAtRef.current,
      isPaused,
      source,
      programId: programIdRef.current,
      programDayKey: programDayKeyRef.current,
    })

    persist()

    const handler = () => { if (document.visibilityState === 'hidden') persist() }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [isActive, circuit, progress, isPaused, source])

  // ── Actions ─────────────────────────────────────────────────────────────

  const startCircuit = useCallback((
    c: CircuitDefinition,
    src: 'custom' | 'preset' | 'program',
    progId?: string,
    progDayKey?: string,
  ) => {
    const now = Date.now()
    startedAtRef.current = now
    programIdRef.current = progId
    programDayKeyRef.current = progDayKey

    const initialPhase = c.mode === 'timed' ? 'work' : 'exercise'
    const initial: CircuitProgress = { ...INITIAL_PROGRESS, phase: initialPhase }

    setCircuit(c)
    setSource(src)
    setProgress(initial)
    setIsPaused(false)
    setIsActive(true)

    saveToStorage({
      circuit: c,
      progress: initial,
      startedAt: now,
      isPaused: false,
      source: src,
      programId: progId,
      programDayKey: progDayKey,
    })

    op.track('circuit_started', { mode: c.mode, exercises: c.exercises.length, rounds: c.rounds, source: src })
  }, [])

  const advanceExercise = useCallback(() => {
    if (!circuit) return

    setProgress(prev => {
      const totalExercises = circuit.exercises.length
      const isLastExercise = prev.currentExerciseIndex >= totalExercises - 1
      const isLastRound = prev.currentRound >= circuit.rounds - 1

      if (circuit.mode === 'timed') {
        // Timed mode: 'work' -> 'rest' -> next work, or 'roundRest' at end of round
        if (prev.phase === 'work') {
          if (isLastExercise && isLastRound) {
            return { ...prev, phase: 'celebrate', completedExercises: prev.completedExercises + 1 }
          }
          if (isLastExercise) {
            // End of round — go to roundRest
            return { ...prev, phase: 'roundRest', completedExercises: prev.completedExercises + 1 }
          }
          // More exercises in this round — go to rest (if restSeconds > 0) or next work
          const restSec = circuit.restSeconds ?? 0
          if (restSec > 0) {
            return { ...prev, phase: 'rest', completedExercises: prev.completedExercises + 1 }
          }
          return {
            ...prev,
            phase: 'work',
            currentExerciseIndex: prev.currentExerciseIndex + 1,
            completedExercises: prev.completedExercises + 1,
          }
        }
        // If in rest or roundRest, advanceToNextPhase handles it
        return prev
      }

      // Circuit mode: 'exercise' -> 'rest' or next exercise/round
      if (prev.phase === 'exercise') {
        if (isLastExercise && isLastRound) {
          return { ...prev, phase: 'celebrate', completedExercises: prev.completedExercises + 1 }
        }
        if (isLastExercise) {
          // End of round
          if (circuit.restBetweenRounds > 0) {
            return { ...prev, phase: 'roundRest', completedExercises: prev.completedExercises + 1 }
          }
          // No round rest — go directly to next round
          return {
            ...prev,
            phase: 'exercise',
            currentRound: prev.currentRound + 1,
            currentExerciseIndex: 0,
            completedExercises: prev.completedExercises + 1,
          }
        }
        // More exercises in this round
        if (circuit.restBetweenExercises > 0) {
          return { ...prev, phase: 'rest', completedExercises: prev.completedExercises + 1 }
        }
        return {
          ...prev,
          currentExerciseIndex: prev.currentExerciseIndex + 1,
          completedExercises: prev.completedExercises + 1,
        }
      }

      return prev
    })
  }, [circuit])

  const advanceToNextPhase = useCallback(() => {
    if (!circuit) return

    setProgress(prev => {
      const totalExercises = circuit.exercises.length
      const isLastExercise = prev.currentExerciseIndex >= totalExercises - 1

      if (prev.phase === 'rest') {
        // After rest between exercises, go to next exercise
        const nextPhase = circuit.mode === 'timed' ? 'work' : 'exercise'
        return {
          ...prev,
          phase: nextPhase,
          currentExerciseIndex: prev.currentExerciseIndex + 1,
        }
      }

      if (prev.phase === 'roundRest') {
        // After round rest, go to first exercise of next round
        const nextPhase = circuit.mode === 'timed' ? 'work' : 'exercise'
        return {
          ...prev,
          phase: nextPhase,
          currentRound: prev.currentRound + 1,
          currentExerciseIndex: 0,
        }
      }

      return prev
    })
  }, [circuit])

  const pause = useCallback(() => {
    setIsPaused(true)
  }, [])

  const resume = useCallback(() => {
    setIsPaused(false)
  }, [])

  const doComplete = useCallback(async (note?: string) => {
    if (!circuit || !userId) return

    try {
      await completeCircuitSession(
        userId,
        circuit,
        progress,
        startedAtRef.current,
        source,
        programIdRef.current,
        programDayKeyRef.current,
        note,
      )
    } catch (e) {
      console.warn('Failed to save circuit session:', e)
    }

    clearStorage()
    setIsActive(false)
    setCircuit(null)
    setProgress(INITIAL_PROGRESS)
    setIsPaused(false)
  }, [circuit, userId, progress, source])

  const abandonCircuit = useCallback(() => {
    clearStorage()
    setIsActive(false)
    setCircuit(null)
    setProgress(INITIAL_PROGRESS)
    setIsPaused(false)

    if (circuit) {
      const elapsed = Math.round((Date.now() - startedAtRef.current) / 1000)
      op.track('circuit_abandoned', { mode: circuit.mode, duration_seconds: elapsed, source })
    }
  }, [circuit, source])

  const value: CircuitSessionContextType = {
    isActive,
    circuit,
    progress,
    startedAt: isActive ? startedAtRef.current : null,
    isPaused,
    source,
    programId: programIdRef.current,
    programDayKey: programDayKeyRef.current,
    startCircuit,
    advanceExercise,
    advanceToNextPhase,
    pause,
    resume,
    completeCircuit: doComplete,
    abandonCircuit,
  }

  return (
    <CircuitSessionContext.Provider value={value}>
      {children}
    </CircuitSessionContext.Provider>
  )
}

export function useCircuitSession() {
  const ctx = useContext(CircuitSessionContext)
  if (!ctx) throw new Error('useCircuitSession must be used within CircuitSessionProvider')
  return ctx
}
