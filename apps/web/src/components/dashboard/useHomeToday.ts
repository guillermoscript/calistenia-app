/**
 * Datos del inicio «qué hago hoy» en web (#855, épica #852).
 *
 * Junta lo que ya tienen los contextos (programa, progreso, sesiones en curso,
 * contador de la cuenta) y se lo pasa a las funciones puras de core:
 * `getHomeState` decide el bloque «Hoy», `getWeekSummary` la semana y
 * `useTrainingWeek` (core) los días de actividad, el objetivo y la racha. Las
 * únicas consultas son el contador de la cuenta (`useHomeStage`) y las sesiones
 * de cardio, que comparten caché con `useCardioStats`.
 */
import { useEffect, useMemo, useState } from 'react'
import { useWorkoutActions, useWorkoutState } from '../../contexts/WorkoutContext'
import { useAuthState } from '../../contexts/AuthContext'
import { useActiveSession } from '../../contexts/ActiveSessionContext'
import { useCardioSessionContext } from '../../contexts/CardioSessionContext'
import { useCircuitSession } from '../../contexts/CircuitSessionContext'
import { isBattleOngoing, useActiveBattle } from '../../hooks/useActiveBattle'
import { useHomeStage } from '@calistenia/core/hooks/useHomeStage'
import { useActivation, useTrackActivationReached } from '@calistenia/core/hooks/useActivation'
import { getHomeState, dayHasContent, resolveLastActivityDay, type HomeState } from '@calistenia/core/lib/homeState'
import { resolveHomeActiveActivity } from '@calistenia/core/lib/homeActiveActivity'
import { getWeekSummary, type WeekSummary } from '@calistenia/core/lib/weekSummary'
import type { WeeklyStreak } from '@calistenia/core/lib/weeklyStreak'
import { useTrainingWeek } from '../../hooks/useTrainingWeek'
import { utcToLocalDateStr } from '@calistenia/core/lib/dateUtils'
import { getQueue } from '@calistenia/core/lib/offlineQueue'
import type { WeekDay, Workout } from '@calistenia/core/types'

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

export function useHomeToday(): HomeToday {
  const { activeProgram, weekDays, programProgress, programsReady } = useWorkoutState()
  const { getWorkout, isWorkoutDone, getLastSessionDate, getDoneDates, getTotalSessions } = useWorkoutActions()
  const { userId, user } = useAuthState()
  const strength = useActiveSession()
  const cardio = useCardioSessionContext()
  const circuit = useCircuitSession()
  const online = useOnline()
  const phase = programProgress?.currentPhase || 1

  const account = useHomeStage(userId, getTotalSessions())
  const doneDates = getDoneDates()
  const activation = useActivation(user?.created, doneDates)
  // Lo emitía ActivationCard, que sale del inicio: el evento no se puede perder.
  useTrackActivationReached(userId ?? null, activation)

  // Días, objetivo y racha: los mismos que Entrenar, Progreso y Perfil.
  const { today, activityDays, goal, streak } = useTrainingWeek()

  // Hoy es la pantalla que más tiempo está abierta: aquí sí se refresca sola (paridad con móvil).
  const { data: activeBattle } = useActiveBattle({ poll: true })
  const battleOngoing = isBattleOngoing(activeBattle)

  // La regla (batalla y, si no, la última que se empezó) vive en core: la misma que móvil.
  const hasWorkout = !!strength.workout
  const hasCircuit = !!circuit.circuit
  const activeActivity = useMemo(() => resolveHomeActiveActivity({
    battleOngoing,
    strength: {
      isActive: strength.isActive,
      hasWorkout,
      source: strength.source,
      startedAt: strength.startedAt,
      workoutKey: strength.workoutKey,
    },
    cardio: { state: cardio.state, startedAt: cardio.startedAt, programDayKey: cardio.programDayKey },
    circuit: { isActive: circuit.isActive, hasCircuit, startedAt: circuit.startedAt, programDayKey: circuit.programDayKey },
  }), [battleOngoing, strength.isActive, hasWorkout, strength.source, strength.startedAt, strength.workoutKey,
    cardio.state, cardio.startedAt, cardio.programDayKey, circuit.isActive, hasCircuit, circuit.startedAt, circuit.programDayKey])

  const programWeekDays = activeProgram ? weekDays : NO_WEEK_DAYS
  const signupDay = user?.created ? utcToLocalDateStr(user.created.replace(' ', 'T')) || null : null

  const week = useMemo(() => getWeekSummary({
    today,
    activityDays,
    weekDays: programWeekDays,
    signupDay,
    inProgressToday: !!activeActivity && (!activeActivity.startedDay || activeActivity.startedDay === today),
  }), [today, activityDays, programWeekDays, signupDay, activeActivity])

  const lastActivityDay = useMemo(() => {
    return resolveLastActivityDay(today, [getLastSessionDate(), activityDays[activityDays.length - 1] ?? null])
  }, [getLastSessionDate, activityDays, today])

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
