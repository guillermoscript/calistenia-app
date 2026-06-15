import { storage } from '../platform'
import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { todayStr, toLocalDateStr, nowLocalForPB, localDateForPB, localMidnightAsUTC, utcToLocalDateStr, startOfWeekStr, addDays, diffDays } from '../lib/dateUtils'
import { op } from '../lib/analytics'
import { qk } from '../lib/query-keys'
import type { Settings, ProgressMap, SetData, ExerciseLog, ExerciseTiming } from '../types'

const LS_KEY = 'calistenia_progress'
const LS_SETTINGS = 'calistenia_settings'

const DEFAULT_SETTINGS: Settings = { phase: 1, startDate: null, weeklyGoal: 5 }

export interface PREvent {
  exerciseId: string
  prKey: string
  oldValue: number
  newValue: number
}

// ─── PR pattern matching (module-level) ─────────────────────────────────────
const PR_PATTERNS: Array<{ test: (id: string) => boolean; key: keyof Settings }> = [
  { test: (id) => id.includes('pullup') || id.includes('chinup') || id === 'chin_up', key: 'pr_pullups' },
  { test: (id) => id.includes('pushup'), key: 'pr_pushups' },
  { test: (id) => id.startsWith('lsit') || id === 'l_sit', key: 'pr_lsit' },
  { test: (id) => id.startsWith('pistol'), key: 'pr_pistol' },
  { test: (id) => id.startsWith('handstand'), key: 'pr_handstand' },
]

/** Scan all logged sets and return PR updates that exceed current values */
const computePRBackfill = (sets: any[], currentSettings: Settings): Partial<Settings> | null => {
  const maxPRs: Partial<Record<keyof Settings, number>> = {}
  for (const s of sets) {
    const repsNum = parseInt(s.reps)
    if (isNaN(repsNum) || repsNum <= 0) continue
    const match = PR_PATTERNS.find(p => p.test(s.exercise_id))
    if (!match) continue
    const cur = (maxPRs[match.key] as number) || 0
    if (repsNum > cur) maxPRs[match.key] = repsNum
  }
  const updates: Partial<Settings> = {}
  let hasUpdates = false
  for (const [key, val] of Object.entries(maxPRs)) {
    const stored = (currentSettings as unknown as Record<string, number>)[key] || 0
    if ((val as number) > stored) {
      ;(updates as any)[key] = val
      hasUpdates = true
    }
  }
  return hasUpdates ? updates : null
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
  isWorkoutDone: (workoutKey: string, date?: string) => boolean
  getExerciseLogs: (exerciseId: string, limit?: number) => ExerciseLog[]
  getWeeklyDoneCount: () => number
  getTotalSessions: () => number
  getLongestStreak: () => number
  updateSettings: (newSettings: Partial<Settings>) => Promise<void>
  getMonthActivity: () => Record<string, boolean>
  getLastSessionDate: () => string | null
  checkAndUpdatePR: (exerciseId: string, reps: string) => Promise<PREvent | null>
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

    const [sessionsRes, setsRes] = await Promise.all([
      // getFullList elimina el límite implícito (500/1000): obtiene todos los registros del usuario
      pb.collection('sessions').getFullList({ filter: sessionFilter, sort: '-completed_at', $autoCancel: false }),
      pb.collection('sets_log').getFullList({ filter: pb.filter('user = {:uid}', { uid }), sort: '-logged_at', $autoCancel: false }),
    ])

    const prog: ProgressMap = {}
    sessionsRes.forEach((s: any) => {
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
      prog[`done_${date}_${s.workout_key}`] = entry
    })

    setsRes.forEach((s: any) => {
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
          pb.collection('settings').update(settingsRec.id, prUpdates).catch(() => {})
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
            pb.collection('settings').update(rec.id, prUpdates).catch(() => {})
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
  const pbReady = !userId || query.isFetched

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
        await pb.collection('sets_log').create({
          user: userId, exercise_id: exerciseId, workout_key: workoutKey,
          reps: setData.reps || '', note: setData.note || '',
          weight_kg: setData.weight ?? null, rpe: setData.rpe ?? null,
          logged_at: date ? localDateForPB(date) : nowLocalForPB(),
        })
      } catch (e) { console.warn('PB sets_log error:', e) }
    }
  }, [usePB, userId, patchProgress])

  // ─── markWorkoutDone ─────────────────────────────────────────────────────
  const markWorkoutDone = useCallback(async (workoutKey: string, note: string = '', warmupCooldown?: { warmupSkipped?: boolean; warmupDurationSeconds?: number; cooldownSkipped?: boolean; cooldownDurationSeconds?: number }, yogaMeta?: { duration_seconds?: number; poses_completed?: number; total_poses?: number }, date?: string, timing?: { durationSeconds?: number; exerciseTimings?: ExerciseTiming[] }) => {
    const d = date || todayStr()
    const k = `done_${d}_${workoutKey}`
    patchProgress(prev => {
      const entry: import('../types').SessionDone = { done: true as const, date: d, workoutKey, completedAt: Date.now(), note }
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
        const isFreeSession = workoutKey.startsWith('free_') || workoutKey.startsWith('manual_')
        const [phaseStr, day] = workoutKey.split('_')
        const sessionData: Record<string, any> = {
          user: userId, workout_key: workoutKey,
          phase: isFreeSession ? -1 : parseInt(phaseStr.replace('p', '')),
          day: isFreeSession ? 'free' : day,
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
        await pb.collection('sessions').create(sessionData)
      } catch (e) { console.warn('PB sessions error:', e) }
    }

    const isFree = workoutKey.startsWith('free_') || workoutKey.startsWith('manual_')
    op.track('workout_completed', { workout_key: workoutKey, is_free_session: isFree })

    if (!isFree && activeProgramId) {
      const psKey = `calistenia_program_started_${activeProgramId}_${userId}`
      if (!storage.getItem(psKey)) {
        storage.setItem(psKey, Date.now().toString())
        op.track('program_started', { program_id: activeProgramId })
      }
    }
  }, [usePB, userId, activeProgramId, patchProgress])

  // ─── unmarkWorkoutDone ───────────────────────────────────────────────────
  const unmarkWorkoutDone = useCallback(async (workoutKey: string, date?: string) => {
    const d = date || todayStr()
    const k = `done_${d}_${workoutKey}`
    patchProgress(prev => { const next = { ...prev }; delete next[k]; return next })

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
      } catch (e) { console.warn('PB unmark session error:', e) }
    }
  }, [usePB, userId, patchProgress])

  // ─── Selectores ──────────────────────────────────────────────────────────
  const isWorkoutDone = useCallback((workoutKey: string, date?: string): boolean => {
    const d = date || todayStr()
    return !!progress[`done_${d}_${workoutKey}`]
  }, [progress])

  const getExerciseLogs = useCallback((exerciseId: string, limit: number = 10): ExerciseLog[] =>
    (Object.values(progress) as any[])
      .filter((v: any) => v.exerciseId === exerciseId && v.sets)
      .sort((a: any, b: any) => b.date?.localeCompare(a.date))
      .slice(0, limit),
  [progress])

  const getWeeklyDoneCount = useCallback((): number => {
    const monday = startOfWeekStr()
    const dates: string[] = []
    for (let i = 0; i < 7; i++) dates.push(addDays(monday, i))
    return Object.keys(progress).filter(k => k.startsWith('done_') && dates.some(d => k.includes(d))).length
  }, [progress])

  const getTotalSessions = useCallback((): number =>
    Object.keys(progress).filter(k => k.startsWith('done_')).length,
  [progress])

  const getLongestStreak = useCallback((): number => {
    const doneDates = [...new Set(
      Object.keys(progress).filter(k => k.startsWith('done_')).map(k => k.split('_')[1])
    )].sort()
    if (doneDates.length === 0) return 0
    let max = 1, streak = 1
    for (let i = 1; i < doneDates.length; i++) {
      if (diffDays(doneDates[i], doneDates[i-1]) === 1) { streak++; max = Math.max(max, streak) } else streak = 1
    }
    return max
  }, [progress])

  const getMonthActivity = useCallback((): Record<string, boolean> => {
    const today = todayStr()
    const year = today.slice(0, 4)
    const month = today.slice(5, 7)
    const daysInMonth = new Date(Number(year), Number(month), 0).getDate()
    const activity: Record<string, boolean> = {}
    for (let dd = 1; dd <= daysInMonth; dd++) {
      const ds = `${year}-${month}-${String(dd).padStart(2, '0')}`
      activity[ds] = Object.keys(progress).some(k => k.startsWith('done_') && k.includes(ds))
    }
    return activity
  }, [progress])

  const getLastSessionDate = useCallback((): string | null => {
    const doneDates = Object.keys(progress)
      .filter(k => k.startsWith('done_'))
      .map(k => k.split('_')[1])
      .filter(Boolean)
      .sort()
    return doneDates.length > 0 ? doneDates[doneDates.length - 1] : null
  }, [progress])

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
  const checkAndUpdatePR = useCallback(async (exerciseId: string, reps: string): Promise<PREvent | null> => {
    const repsNum = parseInt(reps)
    if (isNaN(repsNum) || repsNum <= 0) return null
    const match = PR_PATTERNS.find(p => p.test(exerciseId))
    if (!match) return null
    const prKey = match.key
    const cur = qc.getQueryData<ProgressData>(key)?.settings ?? settings
    const current = (cur as unknown as Record<string, number>)[prKey] || 0
    if (repsNum > current) {
      await updateSettings({ [prKey]: repsNum } as Partial<Settings>)
      op.track('pr_achieved', { exercise_id: exerciseId, pr_key: String(prKey), old_value: current, new_value: repsNum })
      return { exerciseId, prKey: String(prKey), oldValue: current, newValue: repsNum }
    }
    return null
  }, [updateSettings, qc, key, settings])

  return {
    progress, settings, usePB, pbReady,
    logSet, markWorkoutDone, unmarkWorkoutDone, isWorkoutDone,
    getExerciseLogs, getWeeklyDoneCount, getTotalSessions,
    getLongestStreak, updateSettings, getMonthActivity,
    getLastSessionDate, checkAndUpdatePR,
  }
}
