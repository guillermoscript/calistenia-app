import { createContext, useContext, useCallback, useMemo, type ReactNode } from 'react'
import { useProgress, type PREvent } from '../hooks/useProgress'
import { usePrograms } from '../hooks/usePrograms'
import type { Settings, ProgressMap, SetData, ExerciseLog, Phase, WeekDay, Workout, ProgramMeta, CardioDayConfig } from '../types'

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
  cardioDayConfigs: Record<string, CardioDayConfig>
  programsReady: boolean
}

interface WorkoutActions {
  // Progress actions
  logSet: (exerciseId: string, workoutKey: string, setData: Partial<SetData>) => Promise<PREvent | null>
  markWorkoutDone: (workoutKey: string, note?: string, warmupCooldown?: { warmupSkipped?: boolean; warmupDurationSeconds?: number; cooldownSkipped?: boolean; cooldownDurationSeconds?: number }) => Promise<void>
  unmarkWorkoutDone: (workoutKey: string, date?: string) => Promise<void>
  updateSettings: (newSettings: Partial<Settings>) => Promise<void>
  // Progress queries
  isWorkoutDone: (workoutKey: string, date?: string) => boolean
  getExerciseLogs: (exerciseId: string, limit?: number) => ExerciseLog[]
  getWeeklyDoneCount: () => number
  getTotalSessions: () => number
  getLongestStreak: () => number
  getMonthActivity: () => Record<string, boolean>
  getLastSessionDate: () => string | null
  checkAndUpdatePR: (exerciseId: string, reps: string) => Promise<PREvent | null>
  // Program actions
  getWorkout: (phaseNumber: number, dayId: string) => Workout | null
  selectProgram: (programId: string) => Promise<void>
  duplicateProgram: (programId: string) => Promise<string | null>
  deleteProgram: (programId: string) => Promise<boolean>
  refreshPrograms: () => Promise<void>
}

interface WorkoutContextValue {
  state: WorkoutState
  actions: WorkoutActions
}

const WorkoutContext = createContext<WorkoutContextValue | null>(null)

// ── Hooks (exported separately so React Fast Refresh doesn't confuse
//    them with the WorkoutProvider component in this same module) ───────────

export function useWorkout() {
  const ctx = useContext(WorkoutContext)
  if (!ctx) throw new Error('useWorkout must be used within WorkoutProvider')
  return ctx
}

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
    programs, activeProgram, phases, weekDays, cardioDayConfigs, getWorkout,
    selectProgram, duplicateProgram, deleteProgram, refreshPrograms, programsReady,
  } = usePrograms(userId)

  const {
    progress, settings, usePB, pbReady,
    logSet: rawLogSet, markWorkoutDone, unmarkWorkoutDone, isWorkoutDone,
    getExerciseLogs, getWeeklyDoneCount, getTotalSessions,
    getLongestStreak, updateSettings, getMonthActivity,
    getLastSessionDate, checkAndUpdatePR,
  } = useProgress(userId, activeProgram?.id ?? null)

  // Wrap logSet to auto-detect PRs
  const logSet = useCallback(async (exerciseId: string, workoutKey: string, setData: Partial<SetData>): Promise<PREvent | null> => {
    await rawLogSet(exerciseId, workoutKey, setData)
    if (setData.reps) return checkAndUpdatePR(exerciseId, setData.reps as string)
    return null
  }, [rawLogSet, checkAndUpdatePR])

  const state = useMemo<WorkoutState>(() => ({
    progress, settings, usePB, pbReady,
    programs, activeProgram, phases, weekDays, cardioDayConfigs, programsReady,
  }), [progress, settings, usePB, pbReady, programs, activeProgram, phases, weekDays, cardioDayConfigs, programsReady])

  const actions = useMemo<WorkoutActions>(() => ({
    logSet, markWorkoutDone, unmarkWorkoutDone, updateSettings,
    isWorkoutDone, getExerciseLogs, getWeeklyDoneCount,
    getTotalSessions, getLongestStreak, getMonthActivity,
    getLastSessionDate, checkAndUpdatePR,
    getWorkout, selectProgram, duplicateProgram, deleteProgram, refreshPrograms,
  }), [
    logSet, markWorkoutDone, unmarkWorkoutDone, updateSettings,
    isWorkoutDone, getExerciseLogs, getWeeklyDoneCount,
    getTotalSessions, getLongestStreak, getMonthActivity,
    getLastSessionDate, checkAndUpdatePR,
    getWorkout, selectProgram, duplicateProgram, deleteProgram, refreshPrograms,
  ])

  const value = useMemo(() => ({ state, actions }), [state, actions])

  return (
    <WorkoutContext.Provider value={value}>
      {children}
    </WorkoutContext.Provider>
  )
}
