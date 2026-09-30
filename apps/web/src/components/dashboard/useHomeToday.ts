/**
 * Datos del inicio «qué hago hoy» en web (#855, épica #852).
 *
 * Junta lo que ya tienen los contextos (programa, progreso, sesiones en curso,
 * contador de la cuenta) y se lo pasa a las funciones puras de core:
 * `getHomeState` decide el bloque «Hoy», `getWeekSummary` la semana y
 * `computeWeeklyStreak` la racha. No lanza consultas propias: el único dato de
 * red es el contador de la cuenta de `useHomeStage`, que ya existía.
 */
import { useEffect, useMemo, useState } from 'react'
import { useWorkoutActions, useWorkoutState } from '../../contexts/WorkoutContext'
import { useAuthState } from '../../contexts/AuthContext'
import { useActiveSession } from '../../contexts/ActiveSessionContext'
import { useCardioSessionContext } from '../../contexts/CardioSessionContext'
import { useCircuitSession } from '../../contexts/CircuitSessionContext'
import { useHomeStage } from '@calistenia/core/hooks/useHomeStage'
import { useActivation, useTrackActivationReached } from '@calistenia/core/hooks/useActivation'
import { getHomeState, dayHasContent, type HomeActiveActivity, type HomeState } from '@calistenia/core/lib/homeState'
import { activityDaysFromProgress, getWeekSummary, type WeekSummary } from '@calistenia/core/lib/weekSummary'
import { computeWeeklyStreak, type WeeklyStreak } from '@calistenia/core/lib/weeklyStreak'
import { getEffectiveWeeklyGoal } from '@calistenia/core/lib/weeklyGoal'
import { toLocalDateStr, todayStr, utcToLocalDateStr } from '@calistenia/core/lib/dateUtils'
import { getQueue } from '@calistenia/core/lib/offlineQueue'
import type { CardioSession, WeekDay, Workout } from '@calistenia/core/types'

const NO_WEEK_DAYS: readonly WeekDay[] = []

/** `navigator.onLine` con sus eventos. */
function useOnline(): boolean {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

function pendingWrites(): number {
  try {
    return getQueue().length
  } catch {
    return 0
  }
}

/** Día local `YYYY-MM-DD` de un `started_at` de PocketBase (formatos mezclados, #673). */
function cardioDay(session: CardioSession | null | undefined): string | null {
  if (!session?.started_at) return null
  return utcToLocalDateStr(session.started_at.replace(' ', 'T')) || null
}

export interface HomeToday {
  state: HomeState
  today: string
  week: WeekSummary
  /** Objetivo semanal efectivo (#853). */
  goal: number
  streak: WeeklyStreak
  /** Entrenos de toda la cuenta (`useHomeStage`). */
  accountSessions: number
  /** Fase en curso del programa (1 si no hay). */
  phase: number
  /** `getWorkout` de la fase en curso, ya con la semana aplicada. */
  workoutFor: (dayId: string) => Workout | null
}

export function useHomeToday(cardioLastSession?: CardioSession | null): HomeToday {
  const { settings, activeProgram, weekDays, programProgress, progress, programsReady } = useWorkoutState()
  const { getWorkout, isWorkoutDone, getLastSessionDate, getDoneDates, getTotalSessions } = useWorkoutActions()
  const { userId, user } = useAuthState()
  const strength = useActiveSession()
  const cardio = useCardioSessionContext()
  const circuit = useCircuitSession()
  const online = useOnline()
  const today = todayStr()
  const phase = programProgress?.currentPhase || 1

  const account = useHomeStage(userId, getTotalSessions())
  const doneDates = getDoneDates()
  const activation = useActivation(user?.created, doneDates)
  // Lo emitía ActivationCard, que sale del inicio: el evento no se puede perder.
  useTrackActivationReached(userId ?? null, activation)

  const lastCardioDay = cardioDay(cardioLastSession)
  const activityDays = useMemo(() => {
    const days = activityDaysFromProgress(progress)
    // El cardio libre no vive en el ProgressMap; de él solo tenemos la última
    // sesión, que basta para que el día de hoy o de ayer no salga vacío.
    if (lastCardioDay && !days.includes(lastCardioDay)) days.push(lastCardioDay)
    return days
  }, [progress, lastCardioDay])

  const activeActivity = useMemo((): HomeActiveActivity | null => {
    if (strength.isActive && strength.workout) {
      return {
        type: strength.source === 'free' ? 'free' : 'strength',
        startedDay: strength.startedAt ? toLocalDateStr(new Date(strength.startedAt)) : null,
        workoutKey: strength.workoutKey,
      }
    }
    if (cardio.state === 'tracking' || cardio.state === 'paused') {
      return { type: 'cardio', startedDay: null, workoutKey: cardio.programDayKey }
    }
    if (circuit.isActive && circuit.circuit) {
      return {
        type: 'circuit',
        startedDay: circuit.startedAt ? toLocalDateStr(new Date(circuit.startedAt)) : null,
        workoutKey: circuit.programDayKey ?? null,
      }
    }
    return null
  }, [strength.isActive, strength.workout, strength.source, strength.startedAt, strength.workoutKey,
    cardio.state, cardio.programDayKey, circuit.isActive, circuit.circuit, circuit.startedAt, circuit.programDayKey])

  const programWeekDays = activeProgram ? weekDays : NO_WEEK_DAYS
  const goal = getEffectiveWeeklyGoal(settings, activeProgram ? { weekDays } : null)
  const signupDay = user?.created ? utcToLocalDateStr(user.created.replace(' ', 'T')) || null : null

  const week = useMemo(() => getWeekSummary({
    today,
    activityDays,
    weekDays: programWeekDays,
    signupDay,
    inProgressToday: !!activeActivity && (!activeActivity.startedDay || activeActivity.startedDay === today),
  }), [today, activityDays, programWeekDays, signupDay, activeActivity])

  const streak = useMemo(() => computeWeeklyStreak(activityDays, goal, today), [activityDays, goal, today])

  const lastActivityDay = useMemo(() => {
    const candidates = [getLastSessionDate(), lastCardioDay, activityDays[activityDays.length - 1] ?? null]
      .filter((d): d is string => !!d && d <= today)
    return candidates.sort().pop() ?? null
  }, [getLastSessionDate, lastCardioDay, activityDays, today])

  const unsynced = pendingWrites() > 0

  const state = useMemo(() => getHomeState({
    today,
    activeProgram,
    programProgress,
    weekDays,
    dayHasContent: day => dayHasContent(day, getWorkout(phase, day.id)),
    isWorkoutDone,
    lastActivityDay,
    activeActivity,
    account,
    activation: user?.created ? activation : null,
    week: { done: week.done, goal },
    offline: !online,
    unsynced,
    loading: !programsReady,
  }), [today, activeProgram, programProgress, weekDays, getWorkout, phase, isWorkoutDone, lastActivityDay,
    activeActivity, account, user?.created, activation, week.done, goal, online, unsynced, programsReady])

  return {
    state,
    today,
    week,
    goal,
    streak,
    accountSessions: account.sessions,
    phase,
    workoutFor: (dayId: string) => getWorkout(phase, dayId),
  }
}
