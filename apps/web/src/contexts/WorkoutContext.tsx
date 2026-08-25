import { createContext, use, useCallback, useMemo, type ReactNode } from 'react'
import { useProgress, type PREvent } from '@calistenia/core/hooks/useProgress'
import { usePrograms } from '@calistenia/core/hooks/usePrograms'
import { useProgramProgress } from '@calistenia/core/hooks/useProgramProgress'
import type { ProgramProgress } from '@calistenia/core/lib/programProgress'
import type { Settings, ProgressMap, SetData, ExerciseLog, Phase, WeekDay, Workout, ProgramMeta, CardioDayConfig, CircuitDefinition, ExerciseTiming } from '@calistenia/core/types'

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
  /** Circuitos del programa por `p{fase}_{día}` (#625). */
  circuitDayConfigs: Record<string, CircuitDefinition>
  programsReady: boolean
  /** Progreso dentro del programa activo: semana X de Y, fase real, «hoy toca» (#616). */
  programProgress: ProgramProgress
}

interface WorkoutActions {
  // Progress actions
  logSet: (exerciseId: string, workoutKey: string, setData: Partial<SetData>, date?: string) => Promise<PREvent | null>
  markWorkoutDone: (workoutKey: string, note?: string, warmupCooldown?: { warmupSkipped?: boolean; warmupDurationSeconds?: number; cooldownSkipped?: boolean; cooldownDurationSeconds?: number }, yogaMeta?: { duration_seconds?: number; poses_completed?: number; total_poses?: number }, date?: string, timing?: { durationSeconds?: number; exerciseTimings?: ExerciseTiming[] }) => Promise<void>
  unmarkWorkoutDone: (workoutKey: string, date?: string) => Promise<void>
  markCardioDayDone: (workoutKey: string, cardioSessionId: string, note?: string, date?: string) => void
  updateSettings: (newSettings: Partial<Settings>) => Promise<void>
  // Progress queries
  isWorkoutDone: (workoutKey: string, date?: string) => boolean
  getExerciseLogs: (exerciseId: string, limit?: number) => ExerciseLog[]
  getWeeklyDoneCount: () => number
  getTotalSessions: () => number
  getLongestStreak: () => number
  getCurrentStreak: () => number
  getMonthActivity: () => Record<string, boolean>
  getLastSessionDate: () => string | null
  checkAndUpdatePR: (exerciseId: string, reps: string, weight?: number) => Promise<PREvent | null>
  // Program actions
  getWorkout: (phaseNumber: number, dayId: string) => Workout | null
  selectProgram: (programId: string) => Promise<boolean>
  abandonProgram: (programId: string) => Promise<boolean>
  duplicateProgram: (programId: string) => Promise<string | null>
  deleteProgram: (programId: string) => Promise<boolean>
  refreshPrograms: () => Promise<void>
  /** Override manual de fase, guardado en `user_programs` (no en settings). */
  setPhaseOverride: (phase: number | null) => Promise<boolean>
}

interface WorkoutContextValue {
  state: WorkoutState
  actions: WorkoutActions
}

const WorkoutContext = createContext<WorkoutContextValue | null>(null)

// ── Hooks (exported separately so React Fast Refresh doesn't confuse
//    them with the WorkoutProvider component in this same module) ───────────

export function useWorkout() {
  const ctx = use(WorkoutContext)
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
    programs, activeProgram, activeEnrollment, phases, weekDays, cardioDayConfigs, circuitDayConfigs, getWorkout,
    selectProgram, abandonProgram, duplicateProgram, deleteProgram, refreshPrograms, programsReady,
  } = usePrograms(userId)

  const {
    progress, settings, usePB, pbReady,
    logSet: rawLogSet, markWorkoutDone, unmarkWorkoutDone, markCardioDayDone, isWorkoutDone,
    getExerciseLogs, getWeeklyDoneCount, getTotalSessions,
    getLongestStreak, getCurrentStreak, updateSettings, getMonthActivity,
    getLastSessionDate, checkAndUpdatePR,
  } = useProgress(userId, activeProgram?.id ?? null)

  const { programProgress, setPhaseOverride } = useProgramProgress({
    userId, activeProgram, activeEnrollment, phases, weekDays, progress,
    settingsPhase: settings.phase,
  })

  // Wrap logSet to auto-detect PRs
  const logSet = useCallback(async (exerciseId: string, workoutKey: string, setData: Partial<SetData>, date?: string): Promise<PREvent | null> => {
    await rawLogSet(exerciseId, workoutKey, setData, date)
    if (setData.reps) return checkAndUpdatePR(exerciseId, setData.reps as string, setData.weight ?? undefined)
    return null
  }, [rawLogSet, checkAndUpdatePR])

  const state = useMemo<WorkoutState>(() => ({
    progress, settings, usePB, pbReady,
    programs, activeProgram, phases, weekDays, cardioDayConfigs, circuitDayConfigs, programsReady, programProgress,
  }), [progress, settings, usePB, pbReady, programs, activeProgram, phases, weekDays, cardioDayConfigs, circuitDayConfigs, programsReady, programProgress])

  const actions = useMemo<WorkoutActions>(() => ({
    logSet, markWorkoutDone, unmarkWorkoutDone, markCardioDayDone, updateSettings,
    isWorkoutDone, getExerciseLogs, getWeeklyDoneCount,
    getTotalSessions, getLongestStreak, getCurrentStreak, getMonthActivity,
    getLastSessionDate, checkAndUpdatePR,
    getWorkout, selectProgram, abandonProgram, duplicateProgram, deleteProgram, refreshPrograms,
    setPhaseOverride,
  }), [
    logSet, markWorkoutDone, unmarkWorkoutDone, markCardioDayDone, updateSettings,
    isWorkoutDone, getExerciseLogs, getWeeklyDoneCount,
    getTotalSessions, getLongestStreak, getCurrentStreak, getMonthActivity,
    getLastSessionDate, checkAndUpdatePR,
    getWorkout, selectProgram, abandonProgram, duplicateProgram, deleteProgram, refreshPrograms,
    setPhaseOverride,
  ])

  const value = useMemo(() => ({ state, actions }), [state, actions])

  return (
    <WorkoutContext.Provider value={value}>
      {children}
    </WorkoutContext.Provider>
  )
}
