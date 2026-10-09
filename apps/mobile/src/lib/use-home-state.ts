/**
 * Entradas del inicio «qué hago hoy» (#858) para el móvil: junta lo que ya
 * tiene el cliente y se lo pasa a `getHomeState` (#853). Aquí no se decide
 * nada; el estado sale entero de core, igual que en web (#855).
 *
 * Fuentes:
 * - Cuenta: `useHomeStage` (filas de `sessions` en TODOS los programas). Nunca
 *   `getTotalSessions()` a pelo: al cambiar de programa vuelve a 0 y un
 *   veterano vería «Tu primer entreno».
 * - Semana: días con actividad del `ProgressMap` (incluye cardio y circuito
 *   del programa) + cardio libre, en la semana de calendario.
 * - Actividad en curso: batalla, cardio, circuito y sesión de fuerza/libre.
 */
import { useEffect, useMemo, useState } from 'react'
import { useAuthUser } from '@/lib/use-auth-user'
import { useDayRollover } from '@/lib/use-day-rollover'
import { isOnline, onConnectivityChange } from '@/lib/connectivity'
import { useWorkoutState, useWorkoutActions } from '@/contexts/WorkoutContext'
import { useActiveSession } from '@/contexts/ActiveSessionContext'
import { useCircuitSession } from '@/contexts/CircuitSessionContext'
import { useCardioSessionContext } from '@/contexts/CardioSessionContext'
import { isBattleOngoing, useActiveBattle } from '@/lib/use-active-battle'
import { resolveHomeActiveActivity } from '@/lib/home-active-activity'
import { useHomeStage } from '@calistenia/core/hooks/useHomeStage'
import { useActivation, useTrackActivationReached } from '@calistenia/core/hooks/useActivation'
import { useCardioSessions } from '@calistenia/core/hooks/useCardioStats'
import { onTimezoneChange, todayStr, utcToLocalDateStr } from '@calistenia/core/lib/dateUtils'
import { dayHasContent as coreDayHasContent, getHomeState, resolveLastActivityDay, type HomeState } from '@calistenia/core/lib/homeState'
import { activityDaysFromProgress, getWeekSummary, type WeekSummary } from '@calistenia/core/lib/weekSummary'
import { getQueue } from '@calistenia/core/lib/offlineQueue'
import { getEffectiveWeeklyGoal } from '@calistenia/core/lib/weeklyGoal'
import { computeWeeklyStreak, type WeeklyStreak } from '@calistenia/core/lib/weeklyStreak'
import type { CardioSession, WeekDay } from '@calistenia/core/types'

export interface HomeView {
  state: HomeState
  today: string
  week: WeekSummary
  weeklyGoal: number
  streak: WeeklyStreak
  /** Entrenos de toda la cuenta (`useHomeStage().sessions`). */
  accountSessions: number
  /** Fase en curso del programa activo. */
  phase: number
  dayHasContent: (day: WeekDay) => boolean
  /** Último cardio registrado hoy (variante cardio de «Hecho»), o `null`. */
  todayCardio: CardioSession | null
}

/** Escrituras en la cola offline aún sin subir (misma lectura que web). */
function pendingWrites(): number {
  try {
    return getQueue().length
  } catch {
    return 0
  }
}

function useOnline(): boolean {
  const [online, setOnline] = useState(isOnline)
  useEffect(() => onConnectivityChange(setOnline), [])
  return online
}

export function useHomeView(): HomeView {
  const user = useAuthUser()
  const uid = user?.id ?? null
  const { settings, activeProgram, weekDays, programsReady, progress, programProgress, cardioDayConfigs, circuitDayConfigs } = useWorkoutState()
  const { getWorkout, isWorkoutDone, getTotalSessions, getDoneDates, getLastSessionDate } = useWorkoutActions()
  const session = useActiveSession()
  const circuit = useCircuitSession()
  const cardio = useCardioSessionContext()
  const { data: battle } = useActiveBattle()
  const { sessions: cardioSessions } = useCardioSessions(uid)
  const account = useHomeStage(uid, getTotalSessions())
  const online = useOnline()

  // La pestaña no se desmonta: sin esto, pasada la medianoche seguiría en ayer.
  const [today, setToday] = useState(todayStr)
  useDayRollover(next => setToday(next))
  // setTimezone() corre tras el login/refresh: `today` calculado antes con otra zona sería de otro día.
  useEffect(() => onTimezoneChange(() => setToday(todayStr())), [])

  const signupDay = user?.created ? utcToLocalDateStr(String(user.created).replace(' ', 'T')) || null : null
  const activation = useActivation(user?.created as string | undefined, getDoneDates())
  // Lo emitía `ActivationCard`, que desaparece del inicio.
  useTrackActivationReached(uid, activation)

  const phase = programProgress.currentPhase || 1
  const programDays = activeProgram ? weekDays : []

  const activityDays = useMemo(
    () => [
      ...activityDaysFromProgress(progress),
      ...cardioSessions.map(c => utcToLocalDateStr(c.started_at)),
    ].filter(Boolean).sort(),
    [progress, cardioSessions],
  )

  const activeActivity = resolveHomeActiveActivity({
    battleOngoing: isBattleOngoing(battle),
    cardio: { state: cardio.state, programDayKey: cardio.programDayKey },
    circuit: { isActive: circuit.isActive, startedAt: circuit.startedAt, programDayKey: circuit.programDayKey },
    strength: {
      isActive: session.isActive,
      hasWorkout: !!session.workout,
      source: session.source,
      startedAt: session.startedAt,
      workoutKey: session.workoutKey,
    },
  })

  // La regla es la de core (la misma que web). `weekDays` es plano y sin fase:
  // su cardio/circuito sale de la fila de la fase más baja, así que se pisa con
  // la config de la fase en curso (`p{fase}_{día}`) antes de preguntar.
  const dayHasContent = (day: WeekDay): boolean => {
    const key = `p${phase}_${day.id}`
    return coreDayHasContent(
      { ...day, cardioConfig: cardioDayConfigs[key], circuitConfig: circuitDayConfigs[key] },
      getWorkout(phase, day.id),
    )
  }

  const weeklyGoal = getEffectiveWeeklyGoal(settings, activeProgram ? { weekDays } : null)
  const week = getWeekSummary({
    today,
    activityDays,
    weekDays: programDays,
    signupDay,
    inProgressToday: !!activeActivity && (!activeActivity.startedDay || activeActivity.startedDay === today),
  })
  // Racha de cliente con el objetivo de hoy para todas las semanas: la del
  // servidor (#801) lleva el historial de objetivos.
  const streak = computeWeeklyStreak(activityDays, weeklyGoal, today)

  const state = getHomeState({
    today,
    activeProgram,
    programProgress,
    weekDays: programDays,
    dayHasContent,
    isWorkoutDone,
    lastActivityDay: resolveLastActivityDay(today, [getLastSessionDate(), activityDays[activityDays.length - 1] ?? null]),
    activeActivity,
    account,
    activation,
    week: { done: week.done, goal: weeklyGoal },
    offline: !online,
    unsynced: pendingWrites() > 0,
    loading: !programsReady,
  })

  const todayCardio = cardioSessions.find(c => utcToLocalDateStr(c.started_at) === today) ?? null

  return { state, today, week, weeklyGoal, streak, accountSessions: account.sessions, phase, dayHasContent, todayCardio }
}
