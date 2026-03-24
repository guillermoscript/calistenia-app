import { createContext, useContext, useState, useRef, useCallback, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkoutActions } from './WorkoutContext'
import SessionView from '../components/SessionView'
import type { Exercise, Workout } from '../types'

// ── Types ────────────────────────────────────────────────────────────────────

interface FreeSessionExercise {
  id: string
  name: string
  muscles: string
  sets: number | string
  reps: string
  rest: number
  note: string
  youtube: string
  priority: 'high' | 'med' | 'low'
  isTimer?: boolean
  timerSeconds?: number
  demoImages?: string[]
  demoVideo?: string
}

interface FreeSessionContextValue {
  isActive: boolean
  isMinimized: boolean
  exerciseCount: number
  startSession: (exercises: FreeSessionExercise[]) => void
  maximize: () => void
  endSession: () => void
}

const FreeSessionContext = createContext<FreeSessionContextValue | null>(null)

const STORAGE_KEY = 'calistenia_free_session_queue'

function toExercise(ex: FreeSessionExercise): Exercise {
  return {
    id: ex.id, name: ex.name, sets: ex.sets, reps: ex.reps,
    rest: ex.rest, muscles: ex.muscles, note: ex.note,
    youtube: ex.youtube, priority: ex.priority,
    isTimer: ex.isTimer, timerSeconds: ex.timerSeconds,
    demoImages: ex.demoImages, demoVideo: ex.demoVideo,
  }
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function FreeSessionProvider({ children }: { children: ReactNode }) {
  const { logSet: onLogSet, markWorkoutDone: onMarkDone, getExerciseLogs } = useWorkoutActions()
  const navigate = useNavigate()

  const [isActive, setIsActive] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [exercises, setExercises] = useState<FreeSessionExercise[]>([])
  const workoutKeyRef = useRef('')

  const startSession = useCallback((exs: FreeSessionExercise[]) => {
    if (exs.length === 0) return
    workoutKeyRef.current = `free_${Date.now()}`
    setExercises(exs)
    setIsActive(true)
    setIsMinimized(false)
  }, [])

  const minimize = useCallback(() => {
    setIsMinimized(true)
  }, [])

  const maximize = useCallback(() => {
    setIsMinimized(false)
    navigate('/free-session')
  }, [navigate])

  const endSession = useCallback(() => {
    setIsActive(false)
    setIsMinimized(false)
    setExercises([])
    // Clear saved queue
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
  }, [])

  const handleMarkDone = useCallback((key: string, note: string) => {
    onMarkDone(key, note)
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
  }, [onMarkDone])

  const handleExitSession = useCallback(() => {
    endSession()
  }, [endSession])

  const handleGoToDashboard = useCallback(() => {
    endSession()
    navigate('/')
  }, [endSession, navigate])

  const value: FreeSessionContextValue = {
    isActive,
    isMinimized,
    exerciseCount: exercises.length,
    startSession,
    maximize,
    endSession,
  }

  const workout: Workout | null = isActive ? {
    phase: 0, day: 'lun', title: 'Sesion Libre',
    exercises: exercises.map(toExercise),
  } : null

  return (
    <FreeSessionContext.Provider value={value}>
      {children}
      {/* SessionView rendered as overlay — stays mounted across navigation */}
      {isActive && workout && (
        <div
          style={isMinimized
            ? { position: 'fixed', inset: 0, zIndex: 60, visibility: 'hidden' as const, pointerEvents: 'none' as const }
            : { position: 'fixed', inset: 0, zIndex: 60 }
          }
        >
          <SessionView
            workout={workout}
            workoutKey={workoutKeyRef.current}
            onLogSet={onLogSet}
            onMarkDone={handleMarkDone}
            onGoToDashboard={handleGoToDashboard}
            onExitSession={handleExitSession}
            getExerciseLogs={getExerciseLogs}
            onMinimize={minimize}
          />
        </div>
      )}
    </FreeSessionContext.Provider>
  )
}

export function useFreeSession() {
  const ctx = useContext(FreeSessionContext)
  if (!ctx) throw new Error('useFreeSession must be used within FreeSessionProvider')
  return ctx
}
