import { useState, useEffect, useCallback, useRef } from 'react'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import type { Settings, ProgressMap, SetData, ExerciseLog } from '../types'

const LS_KEY = 'calistenia_progress'
const LS_SETTINGS = 'calistenia_settings'

const DEFAULT_SETTINGS: Settings = { phase: 1, startDate: null, weeklyGoal: 5 }

// ─── localStorage helpers ────────────────────────────────────────────────────
const lsGet = (): ProgressMap => { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') } catch { return {} } }
const lsSet = (d: ProgressMap): void => { localStorage.setItem(LS_KEY, JSON.stringify(d)) }
const lsGetSettings = (): Settings => {
  try { return JSON.parse(localStorage.getItem(LS_SETTINGS) || '{"phase":1,"startDate":null,"weeklyGoal":5}') }
  catch { return { phase: 1, startDate: null, weeklyGoal: 5 } }
}
const lsSetSettings = (d: Settings): void => { localStorage.setItem(LS_SETTINGS, JSON.stringify(d)) }

interface UseProgressReturn {
  progress: ProgressMap
  settings: Settings
  usePB: boolean
  pbReady: boolean
  logSet: (exerciseId: string, workoutKey: string, setData: Partial<SetData>) => Promise<void>
  markWorkoutDone: (workoutKey: string, note?: string) => Promise<void>
  isWorkoutDone: (workoutKey: string, date?: string) => boolean
  getExerciseLogs: (exerciseId: string, limit?: number) => ExerciseLog[]
  getWeeklyDoneCount: () => number
  getTotalSessions: () => number
  getLongestStreak: () => number
  updateSettings: (newSettings: Partial<Settings>) => Promise<void>
  getMonthActivity: () => Record<string, boolean>
  getLastSessionDate: () => string | null
}

/**
 * useProgress — gestiona el progreso de entrenamiento.
 *
 * Recibe `userId` (string | null) y opcionalmente `activeProgramId` (string | null).
 * Cuando PocketBase está disponible y hay un usuario autenticado, toda la
 * persistencia va a PB filtrada por ese userId (y programId cuando aplica).
 * En cualquier otro caso cae al fallback de localStorage.
 */
export const useProgress = (userId: string | null = null, activeProgramId: string | null = null): UseProgressReturn => {
  const [progress, setProgress] = useState<ProgressMap>({})
  const [settings, setSettingsState] = useState<Settings>({ ...DEFAULT_SETTINGS })
  const [usePB, setUsePB] = useState(false)
  const [pbReady, setPbReady] = useState(false)
  const initialized = useRef(false)
  const lastUserId = useRef<string | null>(null)

  // ─── Init / re-init cuando cambia el userId o el programa activo ─────────
  useEffect(() => {
    // Si el userId cambia (login / logout) reseteamos el estado
    if (lastUserId.current !== userId) {
      lastUserId.current = userId
      initialized.current = false
      setProgress({})
      setSettingsState({ ...DEFAULT_SETTINGS })
      setPbReady(false)
    }

    if (initialized.current) return
    initialized.current = true

    const init = async () => {
      const available = userId ? await isPocketBaseAvailable() : false
      setUsePB(available && !!userId)
      if (available && userId) {
        await loadFromPB(userId)
      } else {
        loadFromLS()
      }
      setPbReady(true)
    }
    init()
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Re-load from PB when the active program changes ─────────────────────
  // (userId is already initialized at this point; just reload sessions)
  useEffect(() => {
    if (!usePB || !userId || !activeProgramId) return
    loadFromPB(userId)
  }, [activeProgramId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Carga desde localStorage ────────────────────────────────────────────
  const loadFromLS = (): void => {
    const data = lsGet()
    setProgress(data)
    const s = lsGetSettings()
    if (!s.startDate) { s.startDate = new Date().toISOString().split('T')[0]; lsSetSettings(s) }
    setSettingsState(s)
  }

  // ─── Carga desde PocketBase ──────────────────────────────────────────────
  const loadFromPB = async (uid: string): Promise<void> => {
    try {
      // Filter sessions by program if one is active
      const sessionFilter = activeProgramId
        ? pb.filter('user = {:uid} && program = {:pid}', { uid, pid: activeProgramId })
        : pb.filter('user = {:uid}', { uid })

      const [sessionsRes, setsRes] = await Promise.all([
        pb.collection('sessions').getList(1, 500, {
          filter: sessionFilter,
          sort: '-completed_at',
        }),
        pb.collection('sets_log').getList(1, 1000, {
          filter: pb.filter('user = {:uid}', { uid }),
          sort: '-logged_at',
        }),
      ])

      const prog: ProgressMap = {}

      sessionsRes.items.forEach((s: any) => {
        const date = s.completed_at?.split(' ')[0] || s.created?.split(' ')[0]
        prog[`done_${date}_${s.workout_key}`] = {
          done: true, date, workoutKey: s.workout_key,
          note: s.note || '',
        }
      })

      setsRes.items.forEach((s: any) => {
        const date = s.logged_at?.split(' ')[0] || s.created?.split(' ')[0]
        const key = `${date}_${s.workout_key}_${s.exercise_id}`
        if (!prog[key]) prog[key] = { sets: [], date, workoutKey: s.workout_key, exerciseId: s.exercise_id }
        const entry = prog[key] as ExerciseLog
        entry.sets.push({
          reps: s.reps,
          note: s.note,
          timestamp: new Date(s.logged_at || s.created).getTime(),
        })
      })

      setProgress(prog)
      lsSet(prog) // Sincronizar cache local

      // Cargar settings del usuario
      try {
        const settingsRec: any = await pb.collection('settings').getFirstListItem(
          pb.filter('user = {:uid}', { uid })
        )
        const s: Settings = {
          phase: settingsRec.phase,
          startDate: settingsRec.start_date?.split(' ')[0] || null,
          weeklyGoal: settingsRec.weekly_goal || 5,
          pr_pullups:   settingsRec.pr_pullups   || 0,
          pr_pushups:   settingsRec.pr_pushups   || 0,
          pr_lsit:      settingsRec.pr_lsit      || 0,
          pr_pistol:    settingsRec.pr_pistol     || 0,
          pr_handstand: settingsRec.pr_handstand  || 0,
        }
        setSettingsState(s)
        lsSetSettings(s)
      } catch {
        // No hay settings en PB aún, usar localStorage o defaults
        const s = lsGetSettings()
        if (!s.startDate) { s.startDate = new Date().toISOString().split('T')[0]; lsSetSettings(s) }
        setSettingsState(s)
        // Crear registro de settings en PB para este usuario
        if (uid) {
          pb.collection('settings').create({
            user: uid,
            phase: s.phase,
            start_date: s.startDate,
            weekly_goal: s.weeklyGoal,
          }).catch(() => {}) // No bloquear si falla
        }
      }
    } catch (e) {
      console.error('PocketBase load error, falling back to localStorage', e)
      loadFromLS()
    }
  }

  // ─── logSet ──────────────────────────────────────────────────────────────
  const logSet = useCallback(async (exerciseId: string, workoutKey: string, setData: Partial<SetData>) => {
    const date = new Date().toISOString().split('T')[0]
    const key = `${date}_${workoutKey}_${exerciseId}`

    // Siempre guardar en localStorage (cache inmediato)
    setProgress(prev => {
      const existing = prev[key] as ExerciseLog | undefined || { sets: [], date, workoutKey, exerciseId }
      const updated = { ...existing, sets: [...existing.sets, { ...setData, timestamp: Date.now() }] } as ExerciseLog
      const newProg = { ...prev, [key]: updated }
      lsSet(newProg)
      return newProg
    })

    // Guardar en PocketBase si hay usuario autenticado
    if (usePB && userId) {
      try {
        await pb.collection('sets_log').create({
          user: userId,
          exercise_id: exerciseId,
          workout_key: workoutKey,
          reps: setData.reps || '',
          note: setData.note || '',
          logged_at: new Date().toISOString().replace('T', ' '),
        })
      } catch (e) { console.warn('PB sets_log error:', e) }
    }
  }, [usePB, userId])

  // ─── markWorkoutDone ─────────────────────────────────────────────────────
  const markWorkoutDone = useCallback(async (workoutKey: string, note: string = '') => {
    const date = new Date().toISOString().split('T')[0]
    const key = `done_${date}_${workoutKey}`

    setProgress(prev => {
      const newProg = { ...prev, [key]: { done: true as const, date, workoutKey, completedAt: Date.now(), note } }
      lsSet(newProg)
      return newProg
    })

    if (usePB && userId) {
      try {
        const [phaseStr, day] = workoutKey.split('_')
        const sessionData: Record<string, any> = {
          user: userId,
          workout_key: workoutKey,
          phase: parseInt(phaseStr.replace('p', '')),
          day,
          completed_at: new Date().toISOString().replace('T', ' '),
          note: note || '',
        }
        if (activeProgramId) sessionData.program = activeProgramId
        await pb.collection('sessions').create(sessionData)
      } catch (e) { console.warn('PB sessions error:', e) }
    }
  }, [usePB, userId, activeProgramId])

  // ─── Helpers de consulta ─────────────────────────────────────────────────
  const isWorkoutDone = useCallback((workoutKey: string, date?: string): boolean => {
    const d = date || new Date().toISOString().split('T')[0]
    return !!progress[`done_${d}_${workoutKey}`]
  }, [progress])

  const getExerciseLogs = useCallback((exerciseId: string, limit: number = 10): ExerciseLog[] =>
    (Object.values(progress) as any[])
      .filter((v: any) => v.exerciseId === exerciseId && v.sets)
      .sort((a: any, b: any) => b.date?.localeCompare(a.date))
      .slice(0, limit),
  [progress])

  const getWeeklyDoneCount = useCallback((): number => {
    const today = new Date()
    const dates: string[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(today); d.setDate(today.getDate() - today.getDay() + 1 + i)
      dates.push(d.toISOString().split('T')[0])
    }
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
      const diff = (new Date(doneDates[i]).getTime() - new Date(doneDates[i-1]).getTime()) / 86400000
      if (diff === 1) { streak++; max = Math.max(max, streak) } else streak = 1
    }
    return max
  }, [progress])

  const getMonthActivity = useCallback((): Record<string, boolean> => {
    const t = new Date()
    const days = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()
    const activity: Record<string, boolean> = {}
    for (let d = 1; d <= days; d++) {
      const ds = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
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
    const updated: Settings = { ...settings, ...newSettings }
    lsSetSettings(updated)
    setSettingsState(updated)

    if (usePB && userId) {
      try {
        const existing = await pb.collection('settings').getFirstListItem(
          pb.filter('user = {:uid}', { uid: userId })
        )
        await pb.collection('settings').update(existing.id, {
          phase: updated.phase,
          start_date: updated.startDate,
          weekly_goal: updated.weeklyGoal,
          pr_pullups:   updated.pr_pullups   ?? null,
          pr_pushups:   updated.pr_pushups   ?? null,
          pr_lsit:      updated.pr_lsit      ?? null,
          pr_pistol:    updated.pr_pistol     ?? null,
          pr_handstand: updated.pr_handstand  ?? null,
        })
      } catch {
        // No existe aún: crear
        pb.collection('settings').create({
          user: userId,
          phase: updated.phase,
          start_date: updated.startDate,
          weekly_goal: updated.weeklyGoal,
          pr_pullups:   updated.pr_pullups   ?? null,
          pr_pushups:   updated.pr_pushups   ?? null,
          pr_lsit:      updated.pr_lsit      ?? null,
          pr_pistol:    updated.pr_pistol     ?? null,
          pr_handstand: updated.pr_handstand  ?? null,
        }).catch((e: any) => console.warn('PB settings create error:', e))
      }
    }
  }, [settings, usePB, userId])

  return {
    progress, settings, usePB, pbReady,
    logSet, markWorkoutDone, isWorkoutDone,
    getExerciseLogs, getWeeklyDoneCount, getTotalSessions,
    getLongestStreak, updateSettings, getMonthActivity,
    getLastSessionDate,
  }
}
