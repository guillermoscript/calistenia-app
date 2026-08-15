import { getPlatform, storage } from '../platform'
import { useCallback, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { todayStr, toLocalDateStr, nowLocalForPB, localDateForPB, localMidnightAsUTC, utcToLocalDateStr, startOfWeekStr, addDays, diffDays } from '../lib/dateUtils'
import { CANONICAL_ANALYTICS_EVENTS, op, trackCanonicalEvent } from '../lib/analytics'
import { qk } from '../lib/query-keys'
import { parseRepsForPR, estimate1RM } from '../lib/pr-utils'
import { legacyPrKey, pickAffectedChallenges } from '../lib/challenge-scoring'
import { isFreeSessionKey, sessionKeyParts } from '../lib/session-key'
import { persistOrQueue, newClientId, getPendingCreates, cancelLastQueuedByTempId } from '../lib/offlineQueue'
import type { Settings, ProgressMap, SetData, ExerciseLog, ExerciseTiming, WeightPR } from '../types'

const LS_KEY = 'calistenia_progress'
const LS_SETTINGS = 'calistenia_settings'

const DEFAULT_SETTINGS: Settings = { phase: 1, startDate: null, weeklyGoal: 5 }

export interface PREvent {
  exerciseId: string
  prKey: string
  oldValue: number
  newValue: number
  /** 'reps' (default, bodyweight) or 'weight' (gym/weighted: values are kg). */
  kind?: 'reps' | 'weight'
  /** For kind 'weight': reps performed at newValue kg and its estimated 1RM. */
  reps?: number
  e1rm?: number
}

/**
 * Emit `program_milestone_completed` once every configured day of the phase has
 * a completion **for this program**.
 *
 * Completion is read from PocketBase scoped by `program` rather than from the
 * progress cache: that cache is deliberately program-agnostic (localStorage is a
 * single global blob and `loadFromPB` also pulls sessions with `program = ""`),
 * so another program's `p1_lun` would satisfy this program's phase 1 — and the
 * marker written below would then suppress the real milestone forever. Cardio
 * days live in `cardio_sessions`, so both collections are consulted; the local
 * marker keeps the event idempotent across re-renders and both platforms.
 */
async function emitProgramMilestoneIfCompleted(userId: string, programId: string, workoutKey: string): Promise<void> {
  const match = /^p(\d+)_/.exec(workoutKey)
  if (!match) return
  const phase = Number(match[1])
  const milestoneKey = `calistenia_program_milestone_${userId}_${programId}_${phase}`
  if (storage.getItem(milestoneKey)) return

  const dayPrefix = `p${phase}_`
  try {
    const [exerciseDays, configuredDays, sessions, cardioSessions] = await Promise.all([
      pb.collection('program_exercises').getFullList({
        filter: pb.filter('program = {:pid} && phase_number = {:phase}', { pid: programId, phase }),
        fields: 'day_id',
        $autoCancel: false,
      }).catch(() => [] as any[]),
      pb.collection('program_day_config').getFullList({
        filter: pb.filter('program = {:pid} && phase_number = {:phase} && day_type != "rest"', { pid: programId, phase }),
        fields: 'day_id,day_type',
        $autoCancel: false,
      }).catch(() => [] as any[]),
      pb.collection('sessions').getFullList({
        filter: pb.filter('user = {:uid} && program = {:pid} && workout_key ~ {:prefix}', { uid: userId, pid: programId, prefix: `${dayPrefix}%` }),
        fields: 'workout_key',
        $autoCancel: false,
      }).catch(() => [] as any[]),
      pb.collection('cardio_sessions').getFullList({
        filter: pb.filter('user = {:uid} && program = {:pid} && program_day_key ~ {:prefix}', { uid: userId, pid: programId, prefix: `${dayPrefix}%` }),
        fields: 'program_day_key',
        $autoCancel: false,
      }).catch(() => [] as any[]),
    ])
    const requiredDays = new Set<string>([
      ...exerciseDays.map((record: any) => record.day_id).filter(Boolean),
      ...configuredDays.map((record: any) => record.day_id).filter(Boolean),
    ])
    if (requiredDays.size === 0) return

    // `~` is a LIKE match, where `_` is a single-char wildcard: re-check the
    // prefix exactly before slicing it off.
    const completedDays = new Set<string>(
      [
        ...sessions.map((record: any) => record.workout_key),
        ...cardioSessions.map((record: any) => record.program_day_key),
      ]
        .filter((key: unknown): key is string => typeof key === 'string' && key.startsWith(dayPrefix))
        .map((key: string) => key.slice(dayPrefix.length)),
    )
    if (![...requiredDays].every(day => completedDays.has(day))) return

    storage.setItem(milestoneKey, 'true')
    trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.programMilestoneCompleted, {
      surface: 'program',
      source: 'workout_completion',
      program_id: programId,
      workout_id: workoutKey,
      milestone_id: `phase_${phase}`,
      result: 'phase_completed',
    })
  } catch {
    // Analytics must never make workout completion fail.
  }
}

/**
 * Scan all logged sets and rebuild the full `prs` map (every exercise id) plus
 * mirror updates into the 5 legacy pr_* fields. Uses parseRepsForPR so
 * "8-12"→12, "max"→null, etc.
 */
const computePRBackfill = (sets: any[], currentSettings: Settings): Partial<Settings> | null => {
  const bestById: Record<string, number> = { ...(currentSettings.prs ?? {}) }
  const bestWeightById: Record<string, WeightPR> = { ...(currentSettings.weight_prs ?? {}) }
  let changed = false
  let weightChanged = false
  for (const s of sets) {
    const id = s.exercise_id
    if (!id) continue
    const n = parseRepsForPR(s.reps)
    if (n != null && n > (bestById[id] ?? 0)) { bestById[id] = n; changed = true }
    // Weight PR: best set by estimated 1RM (sets_log.weight_kg)
    const e1rm = estimate1RM(s.weight_kg, n)
    if (e1rm != null && e1rm > (bestWeightById[id]?.e1rm ?? 0)) {
      bestWeightById[id] = { weight: s.weight_kg, reps: n ?? 1, e1rm }
      weightChanged = true
    }
  }
  // Mirror into the 5 legacy fields from the best matching id(s).
  const legacy: Partial<Record<keyof Settings, number>> = {}
  for (const [id, n] of Object.entries(bestById)) {
    const lk = legacyPrKey(id)
    if (lk && n > ((legacy[lk] as number) ?? 0)) legacy[lk] = n
  }
  const updates: Partial<Settings> = {}
  let hasUpdates = false
  if (changed) { (updates as any).prs = bestById; hasUpdates = true }
  if (weightChanged) { (updates as any).weight_prs = bestWeightById; hasUpdates = true }
  for (const [k, v] of Object.entries(legacy)) {
    const stored = (currentSettings as unknown as Record<string, number>)[k] || 0
    if ((v as number) > stored) { (updates as any)[k] = v; hasUpdates = true }
  }
  return hasUpdates ? updates : null
}

/**
 * Reconstruye el `ProgressMap` a partir de las filas de `sessions`, `sets_log` y
 * `cardio_sessions`.
 *
 * Vive fuera del hook para poder recibir también los `create` que siguen en la
 * cola offline: su payload usa exactamente los mismos nombres de campo que el
 * registro de PocketBase (`workout_key`, `completed_at`, `exercise_id`,
 * `logged_at`…), así que basta con concatenarlos delante de lo del servidor. Sin
 * esto, `loadFromPB` sobrescribía la caché local con lo remoto y una sesión
 * entrenada sin cobertura desaparecía también del móvil (#301).
 *
 * Los tests de `packages/core` corren en vitest/node sin testing-library, así
 * que esta función es además el punto por el que se prueba la fusión.
 */
export function buildProgressMap(sessionRows: any[], setRows: any[], cardioRows: any[]): ProgressMap {
  const prog: ProgressMap = {}

  sessionRows.forEach((s: any) => {
    const date = utcToLocalDateStr(s.completed_at || s.created)
    const entry: import('../types').SessionDone = { done: true, date, workoutKey: s.workout_key, note: s.note || '' }
    if (s.warmup_skipped || s.warmup_completed || s.warmup_duration_seconds) {
      entry.warmupCompleted = !!s.warmup_completed
      entry.warmupSkipped = !!s.warmup_skipped
      entry.warmupDurationSeconds = s.warmup_duration_seconds || 0
    }
    if (s.cooldown_skipped || s.cooldown_completed || s.cooldown_duration_seconds) {
      entry.cooldownCompleted = !!s.cooldown_completed
      entry.cooldownSkipped = !!s.cooldown_skipped
      entry.cooldownDurationSeconds = s.cooldown_duration_seconds || 0
    }
    if (s.duration_seconds != null || s.poses_completed != null || s.total_poses != null) {
      entry.durationSeconds = s.duration_seconds ?? undefined
      entry.posesCompleted = s.poses_completed ?? undefined
      entry.totalPoses = s.total_poses ?? undefined
    }
    if (Array.isArray(s.exercise_timings) && s.exercise_timings.length > 0) {
      entry.exerciseTimings = s.exercise_timings
    }
    // Varias sesiones del mismo día+workout (repeticiones) comparten clave:
    // conservamos la más reciente (sort -completed_at) y acumulamos el conteo.
    const dk = `done_${date}_${s.workout_key}`
    const existing = prog[dk] as import('../types').SessionDone | undefined
    if (existing?.done) {
      existing.count = (existing.count ?? 1) + 1
    } else {
      entry.count = 1
      prog[dk] = entry
    }
  })

  setRows.forEach((s: any) => {
    const date = utcToLocalDateStr(s.logged_at || s.created)
    const k = `${date}_${s.workout_key}_${s.exercise_id}`
    if (!prog[k]) prog[k] = { sets: [], date, workoutKey: s.workout_key, exerciseId: s.exercise_id }
    const entry = prog[k] as ExerciseLog
    entry.sets.push({
      reps: s.reps,
      note: s.note,
      weight: s.weight_kg || undefined,
      rpe: s.rpe || undefined,
      timestamp: new Date(s.logged_at || s.created).getTime(),
    })
  })

  // Cardio vinculado a un día de programa → marcador "done_" etiquetado con
  // cardioSessionId. Hace que isWorkoutDone(p1_mie) sea true (checkmark del
  // programa) y sobrevive recargas porque se reconstruye desde cardio_sessions
  // igual que las sesiones de fuerza. Las listas/stats lo ignoran por la etiqueta.
  cardioRows.forEach((c: any) => {
    if (!c.program_day_key) return
    const date = utcToLocalDateStr(c.started_at || c.created)
    prog[`done_${date}_${c.program_day_key}`] = {
      done: true,
      date,
      workoutKey: c.program_day_key,
      note: c.note || '',
      completedAt: new Date(c.started_at || c.created).getTime(),
      cardioSessionId: c.id,
    }
  })

  return prog
}

/**
 * Descarta los payloads encolados que el servidor YA devolvió, comparando por
 * `client_id`.
 *
 * Es el caso de la ventana ciega: un create se encoló tras un `status: 0` pero
 * en realidad sí llegó. Hasta que la cola drene y descubra el
 * `validation_not_unique`, el item sigue encolado — y superponerlo sobre la fila
 * real del servidor pintaría la misma serie (o la misma sesión) dos veces.
 */
export function pendingNotYetOnServer(pending: any[], serverRows: any[]): any[] {
  const seen = new Set(serverRows.map((r: any) => r?.client_id).filter(Boolean))
  return pending.filter((p: any) => !p?.client_id || !seen.has(p.client_id))
}

/**
 * Sesiones encoladas que corresponden a este usuario y al programa activo,
 * aplicando el mismo criterio que el `sessionFilter` de `loadFromPB`
 * (`user = uid && (program = pid || program = "")`).
 */
export function pendingSessionRows(uid: string, activeProgramId: string | null, serverRows: any[]): any[] {
  const pending = getPendingCreates('sessions').filter((d: any) => {
    if (d?.user !== uid) return false
    if (!activeProgramId) return true
    return !d.program || d.program === activeProgramId
  })
  return pendingNotYetOnServer(pending, serverRows)
}

/** Series encoladas de este usuario (`sets_log` no se filtra por programa). */
export function pendingSetRows(uid: string, serverRows: any[]): any[] {
  return pendingNotYetOnServer(getPendingCreates('sets_log').filter((d: any) => d?.user === uid), serverRows)
}

// ─── localStorage helpers ────────────────────────────────────────────────────
const lsGet = (): ProgressMap => { try { return JSON.parse(storage.getItem(LS_KEY) || '{}') } catch { return {} } }
const lsSet = (d: ProgressMap): void => { storage.setItem(LS_KEY, JSON.stringify(d)) }
const lsGetSettings = (): Settings => {
  try { return JSON.parse(storage.getItem(LS_SETTINGS) || '{"phase":1,"startDate":null,"weeklyGoal":5}') }
  catch { return { phase: 1, startDate: null, weeklyGoal: 5 } }
}
const lsSetSettings = (d: Settings): void => { storage.setItem(LS_SETTINGS, JSON.stringify(d)) }

/** Garantiza startDate en settings local (igual que loadFromLS previo). */
const ensureStartDate = (s: Settings): Settings => {
  if (!s.startDate) { s.startDate = todayStr(); lsSetSettings(s) }
  return s
}

/** Shape de la query combinada: progreso + settings derivados de PB/LS. */
interface ProgressData { progress: ProgressMap; settings: Settings }

interface UseProgressReturn {
  progress: ProgressMap
  settings: Settings
  usePB: boolean
  pbReady: boolean
  logSet: (exerciseId: string, workoutKey: string, setData: Partial<SetData>, date?: string) => Promise<void>
  markWorkoutDone: (workoutKey: string, note?: string, warmupCooldown?: { warmupSkipped?: boolean; warmupDurationSeconds?: number; cooldownSkipped?: boolean; cooldownDurationSeconds?: number }, yogaMeta?: { duration_seconds?: number; poses_completed?: number; total_poses?: number }, date?: string, timing?: { durationSeconds?: number; exerciseTimings?: ExerciseTiming[] }) => Promise<void>
  unmarkWorkoutDone: (workoutKey: string, date?: string) => Promise<void>
  /**
   * Marca un día de programa de tipo cardio como hecho de forma optimista, sin
   * crear fila en `sessions` (la sesión ya vive en cardio_sessions). Útil para
   * que el checkmark del programa aparezca al instante tras terminar el cardio;
   * en la siguiente carga loadFromPB lo reconstruye desde cardio_sessions.
   */
  markCardioDayDone: (workoutKey: string, cardioSessionId: string, note?: string, date?: string) => void
  isWorkoutDone: (workoutKey: string, date?: string) => boolean
  getExerciseLogs: (exerciseId: string, limit?: number) => ExerciseLog[]
  getWeeklyDoneCount: () => number
  getTotalSessions: () => number
  getLongestStreak: () => number
  updateSettings: (newSettings: Partial<Settings>) => Promise<void>
  getMonthActivity: () => Record<string, boolean>
  getLastSessionDate: () => string | null
  checkAndUpdatePR: (exerciseId: string, reps: string, weight?: number) => Promise<PREvent | null>
}

/**
 * useProgress — progreso de entrenamiento. Migrado a TanStack Query conservando
 * la API pública completa.
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
  const key = qk.sessions(userId, activeProgramId)

  // ─── Carga desde PocketBase → ProgressData ────────────────────────────────
  const loadFromPB = useCallback(async (uid: string): Promise<ProgressData> => {
    const sessionFilter = activeProgramId
      ? pb.filter('user = {:uid} && (program = {:pid} || program = "")', { uid, pid: activeProgramId })
      : pb.filter('user = {:uid}', { uid })

    const [sessionsRes, setsRes, cardioRes] = await Promise.all([
      // getFullList elimina el límite implícito (500/1000): obtiene todos los registros del usuario
      pb.collection('sessions').getFullList({ filter: sessionFilter, sort: '-completed_at', $autoCancel: false }),
      pb.collection('sets_log').getFullList({ filter: pb.filter('user = {:uid}', { uid }), sort: '-logged_at', $autoCancel: false }),
      // Días de programa cardio: solo necesitamos id/fecha/clave para marcar el día hecho.
      pb.collection('cardio_sessions').getFullList({
        filter: pb.filter('user = {:uid} && program_day_key != ""', { uid }),
        sort: '-started_at', fields: 'id,started_at,created,program_day_key,note', $autoCancel: false,
      }).catch(() => [] as any[]),
    ])

    // Lo que sigue en la cola offline se superpone a lo del servidor ANTES de
    // escribir la caché: si no, `lsSet` borraría del móvil el entrenamiento que
    // aún no ha podido subir (#301). Los pendientes van delante porque son la
    // escritura más fresca que conoce este dispositivo.
    const prog = buildProgressMap(
      [...pendingSessionRows(uid, activeProgramId, sessionsRes), ...sessionsRes],
      [...pendingSetRows(uid, setsRes), ...setsRes],
      cardioRes,
    )

    lsSet(prog) // sincronizar cache local

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
        const prUpdates = computePRBackfill(setsRes, s)
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
          const prUpdates = computePRBackfill(setsRes, s)
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
    initialData: () => ({ progress: lsGet(), settings: ensureStartDate(lsGetSettings()) }),
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

  // ─── Helpers de escritura sobre la caché + LS ─────────────────────────────
  const patchProgress = useCallback((updater: (prev: ProgressMap) => ProgressMap) => {
    qc.setQueryData<ProgressData>(key, (old) => {
      const prevProg = old?.progress ?? lsGet()
      const newProg = updater(prevProg)
      lsSet(newProg)
      return { progress: newProg, settings: old?.settings ?? lsGetSettings() }
    })
  }, [qc, key])

  const patchSettings = useCallback((updater: (prev: Settings) => Settings): Settings => {
    let updated!: Settings
    qc.setQueryData<ProgressData>(key, (old) => {
      const prev = old?.settings ?? lsGetSettings()
      updated = updater(prev)
      lsSetSettings(updated)
      return { progress: old?.progress ?? lsGet(), settings: updated }
    })
    return updated
  }, [qc, key])

  // ─── logSet ────────────────────────────────────────────────────────────────
  const logSet = useCallback(async (exerciseId: string, workoutKey: string, setData: Partial<SetData>, date?: string) => {
    const d = date || todayStr()
    const k = `${d}_${workoutKey}_${exerciseId}`
    patchProgress(prev => {
      const existing = prev[k] as ExerciseLog | undefined || { sets: [], date: d, workoutKey, exerciseId }
      const updated = { ...existing, sets: [...existing.sets, { ...setData, timestamp: setData.timestamp ?? Date.now() }] } as ExerciseLog
      return { ...prev, [k]: updated }
    })
    if (usePB && userId) {
      try {
        // #301: por la cola offline. Sin red la serie se encola y se reintenta
        // al reconectar, en vez de perderse en un `console.warn`. El `client_id`
        // se genera aquí y viaja con el payload encolado: es lo que impide que
        // un reintento de una petición que sí llegó cree una fila duplicada.
        await persistOrQueue(pb, {
          collection: 'sets_log',
          action: 'create',
          data: {
            user: userId, exercise_id: exerciseId, workout_key: workoutKey,
            reps: setData.reps || '', note: setData.note || '',
            weight_kg: setData.weight ?? null, rpe: setData.rpe ?? null,
            logged_at: date ? localDateForPB(date) : nowLocalForPB(),
            client_id: newClientId(),
          },
        })
      } catch (e) {
        // Solo llega aquí un 4xx/5xx del servidor (lo de red ya está encolado).
        // El progreso local sigue siendo autoritativo, así que el usuario no ve
        // nada raro: si esto no se reporta, nadie se entera — es exactamente
        // como el #376 estuvo meses tirando toda sesión libre.
        getPlatform().reportError?.(e)
      }
    }
  }, [usePB, userId, patchProgress])

  // ─── markWorkoutDone ─────────────────────────────────────────────────────
  const markWorkoutDone = useCallback(async (workoutKey: string, note: string = '', warmupCooldown?: { warmupSkipped?: boolean; warmupDurationSeconds?: number; cooldownSkipped?: boolean; cooldownDurationSeconds?: number }, yogaMeta?: { duration_seconds?: number; poses_completed?: number; total_poses?: number }, date?: string, timing?: { durationSeconds?: number; exerciseTimings?: ExerciseTiming[] }) => {
    const d = date || todayStr()
    const k = `done_${d}_${workoutKey}`
    patchProgress(prev => {
      // Repetir el mismo entrenamiento el mismo día reusa la clave done_; sumamos
      // al conteo previo para que getTotalSessions/getWeeklyDoneCount no lo pierdan.
      const prevEntry = prev[k] as import('../types').SessionDone | undefined
      const entry: import('../types').SessionDone = { done: true as const, date: d, workoutKey, count: (prevEntry?.count ?? (prevEntry?.done ? 1 : 0)) + 1, completedAt: Date.now(), note }
      if (warmupCooldown) {
        entry.warmupCompleted = !(warmupCooldown.warmupSkipped ?? false) && (warmupCooldown.warmupDurationSeconds ?? 0) > 0
        entry.warmupSkipped = warmupCooldown.warmupSkipped ?? false
        entry.warmupDurationSeconds = warmupCooldown.warmupDurationSeconds ?? 0
        entry.cooldownCompleted = !(warmupCooldown.cooldownSkipped ?? false) && (warmupCooldown.cooldownDurationSeconds ?? 0) > 0
        entry.cooldownSkipped = warmupCooldown.cooldownSkipped ?? false
        entry.cooldownDurationSeconds = warmupCooldown.cooldownDurationSeconds ?? 0
      }
      if (yogaMeta) {
        entry.durationSeconds = yogaMeta.duration_seconds
        entry.posesCompleted = yogaMeta.poses_completed
        entry.totalPoses = yogaMeta.total_poses
      }
      if (timing) {
        if (timing.durationSeconds != null) entry.durationSeconds = timing.durationSeconds
        if (timing.exerciseTimings?.length) entry.exerciseTimings = timing.exerciseTimings
      }
      return { ...prev, [k]: entry }
    })

    if (usePB && userId) {
      try {
        // #376: las sesiones libres se escriben con `phase: 0` (NO_PHASE), no -1.
        // El -1 chocaba con `min: 0` y PocketBase rechazaba el create con un 400
        // que moría en el `catch` de abajo, así que ninguna sesión libre llegó
        // nunca a `sessions`. El 0 solo es aceptable porque la migración
        // 1783100000 marcó `phase` como opcional.
        const { phase, day, isFree: isFreeSession } = sessionKeyParts(workoutKey)
        const sessionData: Record<string, any> = {
          user: userId, workout_key: workoutKey,
          phase,
          day,
          completed_at: date ? localDateForPB(date) : nowLocalForPB(),
          note: note || '',
        }
        if (!isFreeSession && activeProgramId) sessionData.program = activeProgramId
        if (warmupCooldown) {
          sessionData.warmup_completed = !(warmupCooldown.warmupSkipped ?? false) && (warmupCooldown.warmupDurationSeconds ?? 0) > 0
          sessionData.warmup_skipped = warmupCooldown.warmupSkipped ?? false
          sessionData.warmup_duration_seconds = warmupCooldown.warmupDurationSeconds ?? 0
          sessionData.cooldown_completed = !(warmupCooldown.cooldownSkipped ?? false) && (warmupCooldown.cooldownDurationSeconds ?? 0) > 0
          sessionData.cooldown_skipped = warmupCooldown.cooldownSkipped ?? false
          sessionData.cooldown_duration_seconds = warmupCooldown.cooldownDurationSeconds ?? 0
        }
        if (yogaMeta) {
          if (yogaMeta.duration_seconds != null) sessionData.duration_seconds = yogaMeta.duration_seconds
          if (yogaMeta.poses_completed != null) sessionData.poses_completed = yogaMeta.poses_completed
          if (yogaMeta.total_poses != null) sessionData.total_poses = yogaMeta.total_poses
        }
        if (timing) {
          if (timing.durationSeconds != null) sessionData.duration_seconds = timing.durationSeconds
          if (timing.exerciseTimings?.length) sessionData.exercise_timings = timing.exerciseTimings
        }
        sessionData.client_id = newClientId()
        // #301: por la cola offline, igual que las series. El `tempId` es la
        // misma clave que usa el progreso local, para que deshacer el entreno
        // mientras sigue encolado pueda retirarlo (ver unmarkWorkoutDone) en vez
        // de dejar que resucite al reconectar.
        await persistOrQueue(pb, {
          collection: 'sessions', action: 'create', data: sessionData, tempId: k,
        })
      } catch (e) {
        // #376: este catch se tragó durante meses un 400 que impedía guardar
        // TODA sesión libre. El progreso local sigue siendo autoritativo, así
        // que el usuario no ve nada raro — por eso el fallo tiene que llegar al
        // monitoreo o nadie se entera. Los fallos de red ya no pasan por aquí:
        // los absorbe la cola.
        getPlatform().reportError?.(e)
      }
    }

    const isFree = isFreeSessionKey(workoutKey)
    op.track('workout_completed', { workout_key: workoutKey, is_free_session: isFree })

    if (!isFree && activeProgramId) {
      const psKey = `calistenia_program_started_${activeProgramId}_${userId}`
      if (!storage.getItem(psKey)) {
        storage.setItem(psKey, Date.now().toString())
        op.track('program_started', { program_id: activeProgramId })
      }

      if (usePB && userId) void emitProgramMilestoneIfCompleted(userId, activeProgramId, workoutKey)
    }

    // Challenge scores are computed from the same workout/sets data. Emit a
    // lightweight progress event for each active challenge the workout can
    // actually move, without sending notes, health data, or free-form content.
    // Deliberately outside the program branch: free/manual sessions score
    // challenges too.
    if (usePB && userId) {
      const loggedExerciseIds = new Set<string>(
        Object.values(qc.getQueryData<ProgressData>(qk.sessions(userId, activeProgramId))?.progress ?? {})
          .filter((entry: any) => Array.isArray(entry?.sets) && entry.workoutKey === workoutKey && entry.date === d)
          .map((entry: any) => entry.exerciseId)
          .filter(Boolean),
      )
      void (async () => {
        try {
          const participations = await pb.collection('challenge_participants').getFullList({
            filter: pb.filter('user = {:uid}', { uid: userId }),
            expand: 'challenge',
            $autoCancel: false,
          })
          const today = todayStr()
          const affected = pickAffectedChallenges(
            (participations as any[]).map(p => p.expand?.challenge),
            loggedExerciseIds,
            today,
          )
          for (const challenge of affected) {
            trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.challengeProgressUpdated, {
              surface: 'challenge',
              source: 'workout_completion',
              workout_id: workoutKey,
              challenge_id: challenge.id,
              result: 'updated',
            })
          }
        } catch {
          // Challenge analytics is best-effort and can be unavailable offline.
        }
      })()
    }
  }, [usePB, userId, activeProgramId, patchProgress, qc])

  // ─── unmarkWorkoutDone ───────────────────────────────────────────────────
  const markCardioDayDone = useCallback((workoutKey: string, cardioSessionId: string, note: string = '', date?: string) => {
    const d = date || todayStr()
    const k = `done_${d}_${workoutKey}`
    patchProgress(prev => ({
      ...prev,
      [k]: { done: true as const, date: d, workoutKey, completedAt: Date.now(), note, cardioSessionId },
    }))
    // A cardio day counts toward the phase like any other non-rest day, so the
    // milestone has to be re-checked here too — otherwise a phase that ends on
    // its cardio day never emits.
    if (usePB && userId && activeProgramId) {
      void emitProgramMilestoneIfCompleted(userId, activeProgramId, workoutKey)
    }
  }, [patchProgress, usePB, userId, activeProgramId])

  const unmarkWorkoutDone = useCallback(async (workoutKey: string, date?: string) => {
    const d = date || todayStr()
    const k = `done_${d}_${workoutKey}`
    // PB borra UNA sola sesión del día; el cache decrementa su conteo en 1 y
    // solo elimina la clave cuando llega a 0 (soporta repeticiones del día).
    patchProgress(prev => {
      const next = { ...prev }
      const entry = next[k] as import('../types').SessionDone | undefined
      if (entry?.done && (entry.count ?? 1) > 1) {
        next[k] = { ...entry, count: (entry.count ?? 1) - 1 }
      } else {
        delete next[k]
      }
      return next
    })

    // #301: si la sesión que se deshace todavía está en la cola, nunca llegó al
    // servidor: se retira de la cola y no hay nada que borrar. Sin esto, marcar
    // el entreno sin cobertura y deshacerlo sin cobertura lo haría reaparecer al
    // reconectar. Solo el ÚLTIMO encolado con esa clave, porque repetir el mismo
    // entreno el mismo día encola dos bajo el mismo `done_<fecha>_<workoutKey>`.
    if (cancelLastQueuedByTempId(k)) return

    if (usePB && userId) {
      try {
        const dayStart = localMidnightAsUTC(d)
        const dayEndDate = new Date(new Date(`${d}T00:00:00`).getTime() + 86400000)
        const dayEnd = localMidnightAsUTC(toLocalDateStr(dayEndDate))
        const records = await pb.collection('sessions').getList(1, 1, {
          filter: `user = "${userId}" && workout_key = "${workoutKey}" && completed_at >= "${dayStart}" && completed_at < "${dayEnd}"`,
        })
        if (records.items.length > 0) {
          await pb.collection('sessions').delete(records.items[0].id)
        }
      } catch (e) {
        console.warn('PB unmark session error:', e)
        getPlatform().reportError?.(e)
      }
    }
  }, [usePB, userId, patchProgress])

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
        // Los días de cardio de programa (cardioSessionId) marcan el checkmark
        // pero NO cuentan en stats/racha/calendario (se mantienen solo-fuerza/yoga).
        if ((v as any)?.cardioSessionId) continue
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

    // Racha más larga calculada una sola vez al derivar
    const sortedDoneDates = [...doneDateSet].sort()
    let longestStreak = sortedDoneDates.length > 0 ? 1 : 0
    let currentStreak = longestStreak
    for (let i = 1; i < sortedDoneDates.length; i++) {
      if (diffDays(sortedDoneDates[i], sortedDoneDates[i - 1]) === 1) {
        currentStreak++
        longestStreak = Math.max(longestStreak, currentStreak)
      } else {
        currentStreak = 1
      }
    }

    // Última fecha de sesión
    const lastSessionDate = sortedDoneDates.length > 0 ? sortedDoneDates[sortedDoneDates.length - 1] : null

    return { exerciseLogsByIdMap, doneDateSet, doneCountByDate, totalSessions, longestStreak, lastSessionDate, sortedDoneDates }
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

  const updateSettings = useCallback(async (newSettings: Partial<Settings>) => {
    const updated = patchSettings(prev => ({ ...prev, ...newSettings }))
    if (usePB && userId) {
      try {
        const existingRes = await pb.collection('settings').getList(1, 1, {
          filter: pb.filter('user = {:uid}', { uid: userId }), $autoCancel: false,
        })
        const data = {
          phase: updated.phase, start_date: updated.startDate, weekly_goal: updated.weeklyGoal,
          pr_pullups: updated.pr_pullups ?? null, pr_pushups: updated.pr_pushups ?? null,
          pr_lsit: updated.pr_lsit ?? null, pr_pistol: updated.pr_pistol ?? null,
          pr_handstand: updated.pr_handstand ?? null,
        }
        if (existingRes.items.length > 0) {
          await pb.collection('settings').update(existingRes.items[0].id, data)
        } else {
          await pb.collection('settings').create({ user: userId, ...data })
        }
      } catch {
        pb.collection('settings').create({
          user: userId, phase: updated.phase, start_date: updated.startDate, weekly_goal: updated.weeklyGoal,
          pr_pullups: updated.pr_pullups ?? null, pr_pushups: updated.pr_pushups ?? null,
          pr_lsit: updated.pr_lsit ?? null, pr_pistol: updated.pr_pistol ?? null,
          pr_handstand: updated.pr_handstand ?? null,
        }).catch((e: any) => console.warn('PB settings create error:', e))
      }
    }
  }, [usePB, userId, patchSettings])

  // ─── Auto-detect PRs ─────────────────────────────────────────────────────
  const checkAndUpdatePR = useCallback(async (exerciseId: string, reps: string, weight?: number): Promise<PREvent | null> => {
    if (!exerciseId) return null
    const n = parseRepsForPR(reps)
    const cur = qc.getQueryData<ProgressData>(key)?.settings ?? settings

    // Weighted set → weight PR by estimated 1RM (kg). Takes precedence over
    // the reps PR: with load, more reps at the same weight is already captured
    // by the e1rm, and celebrating kg is the meaningful signal for gym work.
    const e1rm = estimate1RM(weight, n)
    if (e1rm != null) {
      const prevW = cur.weight_prs?.[exerciseId]
      if (e1rm > (prevW?.e1rm ?? 0)) {
        const entry: WeightPR = { weight: weight as number, reps: n ?? 1, e1rm }
        const patch: Partial<Settings> = { weight_prs: { ...(cur.weight_prs ?? {}), [exerciseId]: entry } }
        await updateSettings(patch)
        op.track('pr_achieved', { exercise_id: exerciseId, pr_key: exerciseId, kind: 'weight', old_value: prevW?.weight ?? 0, new_value: weight, e1rm })
        return { exerciseId, prKey: exerciseId, oldValue: prevW?.weight ?? 0, newValue: weight as number, kind: 'weight', reps: n ?? 1, e1rm }
      }
      return null
    }

    if (n == null) return null
    const prevBest = (cur.prs?.[exerciseId]) ?? 0
    if (n <= prevBest) return null
    const lk = legacyPrKey(exerciseId)
    const patch: Partial<Settings> = { prs: { ...(cur.prs ?? {}), [exerciseId]: n } }
    if (lk && n > ((cur as unknown as Record<string, number>)[lk] || 0)) {
      (patch as any)[lk] = n
    }
    await updateSettings(patch)
    op.track('pr_achieved', { exercise_id: exerciseId, pr_key: String(lk ?? exerciseId), old_value: prevBest, new_value: n })
    return { exerciseId, prKey: String(lk ?? exerciseId), oldValue: prevBest, newValue: n, kind: 'reps' }
  }, [updateSettings, qc, key, settings])

  return {
    progress, settings, usePB, pbReady,
    logSet, markWorkoutDone, unmarkWorkoutDone, markCardioDayDone, isWorkoutDone,
    getExerciseLogs, getWeeklyDoneCount, getTotalSessions,
    getLongestStreak, updateSettings, getMonthActivity,
    getLastSessionDate, checkAndUpdatePR,
  }
}
