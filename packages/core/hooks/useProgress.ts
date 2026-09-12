import { useCallback, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { todayStr, startOfWeekStr, addDays } from '../lib/dateUtils'
import { computeCurrentStreak, computeLongestStreak } from '../lib/streak'
import { qk } from '../lib/query-keys'
import {
  buildProgressMap, pendingProgressRows,
  type ProgressSessionRow, type ProgressSetRow,
} from '../lib/progress-map'
import { computePRBackfill } from '../lib/pr-backfill'
import {
  DEFAULT_SETTINGS, ensureStartDate, lsGetProgress, lsGetSettings, lsSetProgress, lsSetSettings,
  type ProgressData,
} from '../lib/progress-cache'
import { useProgressMutations } from './useProgressMutations'
import { usePRs, type PREvent } from './usePRs'
import type { Settings, ProgressMap, SetData, ExerciseLog, ExerciseTiming } from '../types'

// Compat: PREvent nació aquí y 5 componentes web/móvil lo importan de este módulo.
export type { PREvent }

interface UseProgressReturn {
  progress: ProgressMap
  settings: Settings
  usePB: boolean
  pbReady: boolean
  logSet: (exerciseId: string, workoutKey: string, setData: Partial<SetData>, date?: string) => Promise<void>
  markWorkoutDone: (workoutKey: string, note?: string, warmupCooldown?: { warmupSkipped?: boolean; warmupDurationSeconds?: number; cooldownSkipped?: boolean; cooldownDurationSeconds?: number }, yogaMeta?: { duration_seconds?: number; poses_completed?: number; total_poses?: number }, date?: string, timing?: { durationSeconds?: number; exerciseTimings?: ExerciseTiming[] }) => Promise<void>
  unmarkWorkoutDone: (workoutKey: string, date?: string) => Promise<void>
  markCardioDayDone: (workoutKey: string, cardioSessionId: string, note?: string, date?: string) => void
  isWorkoutDone: (workoutKey: string, date?: string) => boolean
  getExerciseLogs: (exerciseId: string, limit?: number) => ExerciseLog[]
  getWeeklyDoneCount: () => number
  getTotalSessions: () => number
  getLongestStreak: () => number
  getCurrentStreak: () => number
  updateSettings: (newSettings: Partial<Settings>) => Promise<void>
  getMonthActivity: () => Record<string, boolean>
  getLastSessionDate: () => string | null
  checkAndUpdatePR: (exerciseId: string, reps: string, weight?: number) => Promise<PREvent | null>
}

/**
 * useProgress — progreso de entrenamiento. Fachada que conserva la API pública
 * completa componiendo tres piezas (#476):
 *
 * - este módulo: lectura + derivados (query, loadFromPB, selectores);
 * - `useProgressMutations`: logSet / markWorkoutDone / unmarkWorkoutDone /
 *   markCardioDayDone / updateSettings;
 * - `usePRs`: checkAndUpdatePR.
 *
 * Una sola query (qk.sessions(userId, activeProgramId)) mantiene { progress,
 * settings } derivados de PB (sessions + sets_log + settings), con initialData
 * desde localStorage para arranque offline-first. La key incluye userId y
 * activeProgramId: login/logout y cambio de programa refetchan solos. Las
 * mutaciones escriben optimistamente a la caché + localStorage (autoritativo) y
 * sincronizan a PB en segundo plano. Los selectores leen de la query.
 */
export function useProgress(userId: string | null = null, activeProgramId: string | null = null): UseProgressReturn {
  const qc = useQueryClient()
  // Memoizada: `key` es dep de loadFromPB, y un array recreado por render haría
  // inestable ese useCallback — el mismo antipatrón que useNutrition ya arregló.
  const key = useMemo(() => qk.sessions(userId, activeProgramId), [userId, activeProgramId])

  // ─── Carga desde PocketBase → ProgressData ────────────────────────────────
  const loadFromPB = useCallback(async (uid: string): Promise<ProgressData> => {
    const sessionFilter = activeProgramId
      ? pb.filter('user = {:uid} && (program = {:pid} || program = "")', { uid, pid: activeProgramId })
      : pb.filter('user = {:uid}', { uid })

    const [sessionsRes, setsRes, cardioRes, circuitRes] = await Promise.all([
      // getFullList elimina el límite implícito (500/1000): obtiene todos los registros del usuario
      pb.collection('sessions').getFullList({ filter: sessionFilter, sort: '-completed_at', $autoCancel: false }),
      pb.collection('sets_log').getFullList({ filter: pb.filter('user = {:uid}', { uid }), sort: '-logged_at', $autoCancel: false }),
      // Días de programa cardio: solo necesitamos id/fecha/clave para marcar el día hecho.
      pb.collection('cardio_sessions').getFullList({
        filter: pb.filter('user = {:uid} && program_day_key != ""', { uid }),
        sort: '-started_at', fields: 'id,started_at,created,program_day_key,note', $autoCancel: false,
      }).catch(() => [] as any[]),
      // Días de programa de circuito (#640): mismos campos que cardio. Sin esta
      // lectura, `buildProgressMap` no puede marcar el día hecho por mucho que
      // sepa consumir la fila.
      pb.collection('circuit_sessions').getFullList({
        filter: pb.filter('user = {:uid} && program_day_key != ""', { uid }),
        sort: '-started_at', fields: 'id,started_at,created,program_day_key,note', $autoCancel: false,
      }).catch(() => [] as any[]),
    ])

    // Lo que sigue en la cola offline se superpone a lo del servidor ANTES de
    // escribir la caché: si no, `lsSetProgress` borraría del móvil el
    // entrenamiento que aún no ha podido subir (#301). Los pendientes van
    // delante porque son la escritura más fresca que conoce este dispositivo.
    const sessionRows = sessionsRes as unknown as ProgressSessionRow[]
    const setRows = setsRes as unknown as ProgressSetRow[]
    const pending = pendingProgressRows(uid, activeProgramId, sessionRows, setRows)
    const prog = buildProgressMap(
      [...pending.sessions, ...sessionRows],
      [...pending.sets, ...setRows],
      cardioRes,
      circuitRes,
    )

    lsSetProgress(prog) // sincronizar cache local

    // Settings del usuario (+ backfill de PRs desde los sets).
    let settings: Settings = ensureStartDate(lsGetSettings())
    try {
      const settingsRes = await pb.collection('settings').getList(1, 1, {
        filter: pb.filter('user = {:uid}', { uid }), $autoCancel: false,
      })
      if (settingsRes.items.length > 0) {
        const settingsRec: any = settingsRes.items[0]
        const s: Settings = {
          phase: settingsRec.phase,
          startDate: settingsRec.start_date?.split(' ')[0] || null,
          weeklyGoal: settingsRec.weekly_goal || 5,
          pr_pullups: settingsRec.pr_pullups || 0,
          pr_pushups: settingsRec.pr_pushups || 0,
          pr_lsit: settingsRec.pr_lsit || 0,
          pr_pistol: settingsRec.pr_pistol || 0,
          pr_handstand: settingsRec.pr_handstand || 0,
        }
        const prUpdates = computePRBackfill(setRows, s)
        if (prUpdates) {
          Object.assign(s, prUpdates)
          // Strip prs/weight_prs (localStorage-only) before writing to PB typed columns.
          const { prs: _prs, weight_prs: _wprs, ...pbPrUpdates } = prUpdates as any
          if (Object.keys(pbPrUpdates).length > 0) {
            pb.collection('settings').update(settingsRec.id, pbPrUpdates).catch(() => {})
          }
        }
        settings = s
        lsSetSettings(s)
      } else {
        const s = ensureStartDate(lsGetSettings())
        settings = s
        // Crear settings en PB; aplicar PRs al caché cuando confirme.
        pb.collection('settings').create({
          user: uid, phase: s.phase, start_date: s.startDate, weekly_goal: s.weeklyGoal,
        }).then((rec: any) => {
          const prUpdates = computePRBackfill(setRows, s)
          if (prUpdates) {
            // Strip prs (localStorage-only) before writing to PB typed columns.
            const { prs: _prs, ...pbPrUpdates } = prUpdates as any
            if (Object.keys(pbPrUpdates).length > 0) {
              pb.collection('settings').update(rec.id, pbPrUpdates).catch(() => {})
            }
            qc.setQueryData<ProgressData>(key, (old) => old ? { ...old, settings: { ...old.settings, ...prUpdates } } : old)
          }
        }).catch(() => {})
      }
    } catch {
      settings = lsGetSettings()
    }

    return { progress: prog, settings }
  }, [activeProgramId, qc, key])

  const query = useQuery<ProgressData>({
    queryKey: key,
    enabled: !!userId,
    initialData: () => ({ progress: lsGetProgress(), settings: ensureStartDate(lsGetSettings()) }),
    initialDataUpdatedAt: 0, // fuerza refetch al montar para fusionar con PB
    staleTime: 30_000,
    queryFn: () => loadFromPB(userId!),
  })

  const progress = query.data?.progress ?? {}
  const settings = query.data?.settings ?? { ...DEFAULT_SETTINGS }
  const usePB = !!userId
  // pbReady no debe regresar a false cuando cambia el programa activo (la key
  // incluye activeProgramId, y una key nueva arranca con isFetched=false): App
  // desmontaría el árbol entero hacia el AppLoader — en onboarding eso resetea
  // el wizard justo al elegir programa. Una vez cargado para este usuario,
  // queda listo hasta que cambie de usuario.
  const readyForUserRef = useRef<string | null>(null)
  if (userId && query.isFetched) readyForUserRef.current = userId
  const pbReady = !userId || query.isFetched || readyForUserRef.current === userId

  // ─── Mutaciones y PRs (hooks hermanos sobre la misma caché) ───────────────
  const { logSet, markWorkoutDone, unmarkWorkoutDone, markCardioDayDone, updateSettings } =
    useProgressMutations(userId, activeProgramId)
  const { checkAndUpdatePR } = usePRs(userId, activeProgramId)

  // ─── Estructuras derivadas (se recomputan solo cuando progress cambia) ────
  const derivedProgress = useMemo(() => {
    // Índice de ejercicios: exerciseId → logs ordenados desc por fecha
    const exerciseLogsByIdMap = new Map<string, any[]>()
    // Conjunto de fechas con sesión completada (presencia): 'YYYY-MM-DD'
    const doneDateSet = new Set<string>()
    // Conteo de claves done_ por fecha: varios workouts el mismo día cuentan por separado
    const doneCountByDate = new Map<string, number>()
    // Conteo total de claves done_ para getTotalSessions
    let totalSessions = 0

    for (const [k, v] of Object.entries(progress)) {
      if (k.startsWith('done_')) {
        // Los días de cardio (cardioSessionId) y de circuito (circuitSessionId)
        // de programa marcan el checkmark pero NO cuentan en
        // stats/racha/calendario (se mantienen solo-fuerza/yoga).
        if ((v as any)?.cardioSessionId || (v as any)?.circuitSessionId) continue
        // Una clave done_ puede representar varias sesiones (repeticiones del
        // mismo día+workout); contamos por su `count` (ausente = 1).
        const n = (v as any)?.count ?? 1
        totalSessions += n
        const date = k.split('_')[1]
        if (date) {
          doneDateSet.add(date)
          doneCountByDate.set(date, (doneCountByDate.get(date) ?? 0) + n)
        }
      } else if ((v as any)?.exerciseId && (v as any)?.sets) {
        const exId: string = (v as any).exerciseId
        if (!exerciseLogsByIdMap.has(exId)) exerciseLogsByIdMap.set(exId, [])
        exerciseLogsByIdMap.get(exId)!.push(v)
      }
    }

    // Ordenar cada lista de logs desc por fecha (una vez, no en cada llamada)
    for (const [, logs] of exerciseLogsByIdMap) {
      logs.sort((a: any, b: any) => b.date?.localeCompare(a.date))
    }

    // Rachas calculadas una sola vez al derivar (funciones puras testeadas en
    // lib/streak.ts). `longestStreak` es el récord histórico; `currentStreak`
    // es la racha viva, la que se enseña a diario.
    const sortedDoneDates = [...doneDateSet].sort()
    const longestStreak = computeLongestStreak(doneDateSet)
    const currentStreak = computeCurrentStreak(doneDateSet, todayStr())

    // Última fecha de sesión
    const lastSessionDate = sortedDoneDates.length > 0 ? sortedDoneDates[sortedDoneDates.length - 1] : null

    return { exerciseLogsByIdMap, doneDateSet, doneCountByDate, totalSessions, longestStreak, currentStreak, lastSessionDate, sortedDoneDates }
  }, [progress])

  // ─── Selectores ──────────────────────────────────────────────────────────
  const isWorkoutDone = useCallback((workoutKey: string, date?: string): boolean => {
    const d = date || todayStr()
    return !!progress[`done_${d}_${workoutKey}`]
  }, [progress])

  // Lee del índice precalculado: O(1) lookup + O(k) slice en lugar de O(n) scan
  const getExerciseLogs = useCallback((exerciseId: string, limit: number = 10): ExerciseLog[] => {
    const logs = derivedProgress.exerciseLogsByIdMap.get(exerciseId) ?? []
    return logs.slice(0, limit) as ExerciseLog[]
  }, [derivedProgress])

  // Suma sesiones por clave de la semana (varios workouts el mismo día cuentan
  // por separado, igual que el original). O(7) leyendo del conteo precalculado.
  const getWeeklyDoneCount = useCallback((): number => {
    const monday = startOfWeekStr()
    let count = 0
    for (let i = 0; i < 7; i++) {
      count += derivedProgress.doneCountByDate.get(addDays(monday, i)) ?? 0
    }
    return count
  }, [derivedProgress])

  // Lectura directa del valor precalculado: O(1)
  const getTotalSessions = useCallback((): number =>
    derivedProgress.totalSessions,
  [derivedProgress])

  // Lectura directa del valor precalculado: O(1)
  const getLongestStreak = useCallback((): number =>
    derivedProgress.longestStreak,
  [derivedProgress])

  // Racha viva (termina hoy o ayer), no el récord histórico. Lectura O(1).
  const getCurrentStreak = useCallback((): number =>
    derivedProgress.currentStreak,
  [derivedProgress])

  // Construye el mapa mes-actual con lookup O(1) en el Set de fechas
  const getMonthActivity = useCallback((): Record<string, boolean> => {
    const today = todayStr()
    const year = today.slice(0, 4)
    const month = today.slice(5, 7)
    const daysInMonth = new Date(Number(year), Number(month), 0).getDate()
    const activity: Record<string, boolean> = {}
    for (let dd = 1; dd <= daysInMonth; dd++) {
      const ds = `${year}-${month}-${String(dd).padStart(2, '0')}`
      activity[ds] = derivedProgress.doneDateSet.has(ds)
    }
    return activity
  }, [derivedProgress])

  // Lectura directa del valor precalculado: O(1)
  const getLastSessionDate = useCallback((): string | null =>
    derivedProgress.lastSessionDate,
  [derivedProgress])

  return {
    progress, settings, usePB, pbReady,
    logSet, markWorkoutDone, unmarkWorkoutDone, markCardioDayDone, isWorkoutDone,
    getExerciseLogs, getWeeklyDoneCount, getTotalSessions,
    getLongestStreak, getCurrentStreak, updateSettings, getMonthActivity,
    getLastSessionDate, checkAndUpdatePR,
  }
}
