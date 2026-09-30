/**
 * Racha SEMANAL del usuario (#801): semanas de calendario seguidas cumpliendo
 * el objetivo semanal efectivo.
 *
 * Es la misma racha que guarda el servidor en `user_stats` (ranking, perfil
 * público, widgets, push), calculada con el mismo algoritmo
 * (`lib/weeklyStreak.ts` ⇄ `pb_hooks/utils/weekly_streak.js`) sobre los mismos
 * datos:
 *
 * - DÍAS: de las tres colecciones (`sessions`, `circuit_sessions`,
 *   `cardio_sessions`), de TODOS los programas, con la regla de fechas del
 *   servidor (`streakDayOf`). El `ProgressMap` de `useProgress` no sirve: solo
 *   trae el programa activo y el cardio/circuito del programa.
 * - OBJETIVO: `settings.weekly_goal_log` con `goalForWeekFromChanges`. Este hook
 *   es quien lo mantiene: cuando el objetivo efectivo (programa, fase u objetivo
 *   a mano) cambia, añade la entrada. El servidor recalcula su racha al verla.
 *
 * Además de lo que ya está en el servidor, suma lo que el servidor aún no
 * tiene: los entrenos de la cola offline y el de hoy recién marcado.
 */
import { useEffect, useMemo } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'
import { todayStr } from '../lib/dateUtils'
import { pendingProgressRows } from '../lib/progress-map'
import {
  computeWeeklyStreak,
  goalForWeekFromChanges,
  HISTORICAL_WEEKLY_GOAL,
  streakDayOf,
  withGoalChange,
  type WeeklyStreak,
} from '../lib/weeklyStreak'
import type { ProgressMap, Settings } from '../types'

export interface UseWorkoutStreakArgs {
  userId: string | null
  progress: ProgressMap
  settings: Settings
  /** `getEffectiveWeeklyGoal(settings, activeProgram ? { weekDays } : null)`. */
  effectiveGoal: number
  /**
   * `true` cuando los settings y el programa activo ya vienen del servidor
   * (`pbReady && programsReady`). Antes, el objetivo efectivo puede ser el de
   * «sin programa» de un instante y se colaría en el historial.
   */
  goalReady: boolean
  updateSettings: (s: Partial<Settings>) => Promise<void>
}

/** Días con entreno según el servidor, más los de la cola offline. */
async function fetchStreakDays(uid: string): Promise<string[]> {
  const filter = pb.filter('user = {:uid}', { uid })
  const [sessions, circuits, cardio] = await Promise.all([
    pb.collection('sessions').getFullList({ filter, fields: 'completed_at,client_id', $autoCancel: false }),
    pb.collection('circuit_sessions').getFullList({ filter, fields: 'finished_at,started_at', $autoCancel: false }).catch(() => []),
    pb.collection('cardio_sessions').getFullList({ filter, fields: 'finished_at,started_at', $autoCancel: false }).catch(() => []),
  ])
  const days = new Set<string>()
  const add = (day: string | null) => { if (day) days.add(day) }
  for (const s of sessions) add(streakDayOf(s.completed_at))
  for (const c of [...circuits, ...cardio]) add(streakDayOf(c.finished_at, c.started_at))
  // Entrenos guardados sin conexión que aún no han subido: el servidor los
  // contará cuando lleguen, con la misma fecha.
  for (const s of pendingProgressRows(uid, null, sessions as Array<{ client_id?: string }>, []).sessions) {
    add(streakDayOf(s.completed_at))
  }
  return [...days].sort()
}

const EMPTY_STREAK: WeeklyStreak = {
  current: 0,
  best: 0,
  thisWeek: { weekStart: '', done: 0, goal: HISTORICAL_WEEKLY_GOAL, met: false, remaining: HISTORICAL_WEEKLY_GOAL },
}

export function useWorkoutStreak({
  userId, progress, settings, effectiveGoal, goalReady, updateSettings,
}: UseWorkoutStreakArgs): WeeklyStreak {
  const today = todayStr()

  // Cambia al marcar o desmarcar un entreno: la clave nueva relee los días.
  const doneKeys = useMemo(() => Object.keys(progress ?? {}).filter(k => k.startsWith('done_')), [progress])
  const stamp = String(doneKeys.length)
  const doneToday = doneKeys.some(k => k.startsWith(`done_${today}_`))

  const { data: serverDays } = useQuery({
    queryKey: qk.streakDays(userId, stamp),
    enabled: !!userId,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: () => fetchStreakDays(userId!),
  })

  const storedLog = settings.weeklyGoalLog

  // Mantener el historial: una entrada cuando el objetivo efectivo cambia.
  // `storedLog` undefined = aún no se ha leído de PocketBase; escribir entonces
  // pisaría el historial que ya tuviera la cuenta.
  useEffect(() => {
    if (!userId || !goalReady || !storedLog) return
    const next = withGoalChange(storedLog, effectiveGoal, today)
    if (next) void updateSettings({ weeklyGoalLog: next })
  }, [userId, goalReady, storedLog, effectiveGoal, today, updateSettings])

  return useMemo(() => {
    if (!userId) return EMPTY_STREAK
    const base = storedLog ?? []
    // El cambio de hoy cuenta ya, aunque su guardado siga en vuelo.
    const log = (goalReady && withGoalChange(base, effectiveGoal, today)) || base
    const days = [...(serverDays ?? [])]
    // Recién marcado: su sesión puede no estar aún en el servidor. Hoy es el
    // mismo día que el servidor le pondrá (`completed_at` en hora local).
    if (doneToday) days.push(today)
    return computeWeeklyStreak(days, goalForWeekFromChanges(log, HISTORICAL_WEEKLY_GOAL), today)
  }, [userId, storedLog, goalReady, effectiveGoal, today, serverDays, doneToday])
}
