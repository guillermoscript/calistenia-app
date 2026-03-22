import { createContext, useContext, useCallback, useMemo, type ReactNode } from 'react'
import { useProgress } from '../hooks/useProgress'
import { usePrograms } from '../hooks/usePrograms'
import type { Settings, ProgressMap, SetData, ExerciseLog, Phase, WeekDay, Workout, ProgramMeta } from '../types'

// ── Context interface (state + actions + meta) ──────────────────────────────

interface WorkoutState {
  // Progress
  progress: ProgressMap
  settings: Settings
  usePB: boolean
  pbReady: boolean
  // Programs
  programs: ProgramMeta[]
  activeProgram: ProgramMeta | null
  phases: Phase[]
  weekDays: WeekDay[]
  programsReady: boolean
}

interface WorkoutActions {
  // Progress actions
  logSet: (exerciseId: string, workoutKey: string, setData: Partial<SetData>) => Promise<void>
  markWorkoutDone: (workoutKey: string, note?: string) => Promise<void>
  updateSettings: (newSettings: Partial<Settings>) => Promise<void>
  // Progress queries
  isWorkoutDone: (workoutKey: string, date?: string) => boolean
  getExerciseLogs: (exerciseId: string, limit?: number) => ExerciseLog[]
  getWeeklyDoneCount: () => number
  getTotalSessions: () => number
  getLongestStreak: () => number
  getMonthActivity: () => Record<string, boolean>
  getLastSessionDate: () => string | null
  checkAndUpdatePR: (exerciseId: string, reps: string) => void
  // Program actions
  getWorkout: (phaseNumber: number, dayId: string) => Workout | null
  selectProgram: (programId: string) => Promise<void>
  duplicateProgram: (programId: string) => Promise<string | null>
  deleteProgram: (programId: string) => Promise<boolean>
}

interface WorkoutContextValue {
  state: WorkoutState
  actions: WorkoutActions
}

const WorkoutContext = createContext<WorkoutContextValue | null>(null)

// ── Hook ────────────────────────────────────────────────────────────────────

export function useWorkout() {
  const ctx = useContext(WorkoutContext)
  if (!ctx) throw new Error('useWorkout must be used within WorkoutProvider')
  return ctx
}

// Convenience hooks for common access patterns
export function useWorkoutState() {
  return useWorkout().state
}

export function useWorkoutActions() {
  return useWorkout().actions
}

// ── Provider ────────────────────────────────────────────────────────────────

interface WorkoutProviderProps {
  userId: string | null
  children: ReactNode
}

export function WorkoutProvider({ userId, children }: WorkoutProviderProps) {
  const {
    programs, activeProgram, phases, weekDays, getWorkout,
    selectProgram, duplicateProgram, deleteProgram, programsReady,
  } = usePrograms(userId)

  const {
    progress, settings, usePB, pbReady,
    logSet: rawLogSet, markWorkoutDone, isWorkoutDone,
    getExerciseLogs, getWeeklyDoneCount, getTotalSessions,
    getLongestStreak, updateSettings, getMonthActivity,
    getLastSessionDate, checkAndUpdatePR,
  } = useProgress(userId, activeProgram?.id ?? null)

  // Wrap logSet to auto-detect PRs
  const logSet = useCallback(async (exerciseId: string, workoutKey: string, setData: Partial<SetData>) => {
    await rawLogSet(exerciseId, workoutKey, setData)
    if (setData.reps) checkAndUpdatePR(exerciseId, setData.reps as string)
  }, [rawLogSet, checkAndUpdatePR])

  const state = useMemo<WorkoutState>(() => ({
    progress, settings, usePB, pbReady,
    programs, activeProgram, phases, weekDays, programsReady,
  }), [progress, settings, usePB, pbReady, programs, activeProgram, phases, weekDays, programsReady])

  const actions = useMemo<WorkoutActions>(() => ({
    logSet, markWorkoutDone, updateSettings,
    isWorkoutDone, getExerciseLogs, getWeeklyDoneCount,
    getTotalSessions, getLongestStreak, getMonthActivity,
    getLastSessionDate, checkAndUpdatePR,
    getWorkout, selectProgram, duplicateProgram, deleteProgram,
  }), [
    logSet, markWorkoutDone, updateSettings,
    isWorkoutDone, getExerciseLogs, getWeeklyDoneCount,
    getTotalSessions, getLongestStreak, getMonthActivity,
    getLastSessionDate, checkAndUpdatePR,
    getWorkout, selectProgram, duplicateProgram, deleteProgram,
  ])

  const value = useMemo(() => ({ state, actions }), [state, actions])

  return (
    <WorkoutContext.Provider value={value}>
      {children}
    </WorkoutContext.Provider>
  )
}
