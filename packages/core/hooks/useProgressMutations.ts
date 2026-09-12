import { useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getPlatform } from '../platform'
import { pb } from '../lib/pocketbase'
import { todayStr, toLocalDateStr, nowLocalForPB, localDateForPB, localMidnightAsUTC } from '../lib/dateUtils'
import { CANONICAL_ANALYTICS_EVENTS, emitOnce, op, trackCanonicalEvent } from '../lib/analytics'
import { qk } from '../lib/query-keys'
import { pickAffectedChallenges } from '../lib/challenge-scoring'
import { isFreeSessionKey, sessionKeyParts } from '../lib/session-key'
import { TRAINING_FUNNEL_EVENTS, sessionFunnelProperties } from '../lib/session-funnel'
import { persistOrQueue, newClientId, cancelLastQueuedByTempId } from '../lib/offlineQueue'
import { emitProgramMilestoneIfCompleted } from '../lib/program-milestone'
import { patchProgressData, patchSettingsData, type ProgressData } from '../lib/progress-cache'
import type { Settings, ProgressMap, SetData, ExerciseLog, ExerciseTiming, SessionDone } from '../types'

export interface UseProgressMutationsReturn {
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
  updateSettings: (newSettings: Partial<Settings>) => Promise<void>
}

/**
 * useProgressMutations — escrituras del progreso de entrenamiento (parte de la
 * descomposición de useProgress, #476).
 *
 * Escribe optimistamente a la caché de `qk.sessions(userId, activeProgramId)` +
 * localStorage (autoritativo) vía `lib/progress-cache`, y sincroniza a
 * PocketBase en segundo plano por la cola offline (#301).
 */
export function useProgressMutations(userId: string | null = null, activeProgramId: string | null = null): UseProgressMutationsReturn {
  const qc = useQueryClient()
  // Memoizada: `key` es dep de todos los useCallback de abajo; un array
  // recreado por render los haría inestables en cascada.
  const key = useMemo(() => qk.sessions(userId, activeProgramId), [userId, activeProgramId])
  const usePB = !!userId

  const patchProgress = useCallback((updater: (prev: ProgressMap) => ProgressMap) => {
    patchProgressData(qc, key, updater)
  }, [qc, key])

  const patchSettings = useCallback((updater: (prev: Settings) => Settings): Settings =>
    patchSettingsData(qc, key, updater),
  [qc, key])

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
      const prevEntry = prev[k] as SessionDone | undefined
      const entry: SessionDone = { done: true as const, date: d, workoutKey, count: (prevEntry?.count ?? (prevEntry?.done ? 1 : 0)) + 1, completedAt: Date.now(), note }
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
    // #636: `workout_completed` es el numerador de la tasa de finalización y
    // `session_started` el denominador, así que tienen que poder cruzarse por
    // las mismas dimensiones. Antes este evento llevaba solo dos propiedades y
    // el embudo no se podía segmentar ni por programa ni por plataforma.
    //
    // `exercise_count`/`completion_pct` no salen: aquí solo se sabe lo que se
    // REGISTRÓ, no lo que el entreno tenía planificado — eso lo sabe el contexto
    // de la sesión activa, que es quien las manda en los otros tres eventos.
    const loggedEntries = Object.values(qc.getQueryData<ProgressData>(key)?.progress ?? {})
      .filter((entry: any) => Array.isArray(entry?.sets) && entry.workoutKey === workoutKey && entry.date === d)
    op.track(TRAINING_FUNNEL_EVENTS.workoutCompleted, sessionFunnelProperties({
      workoutKey,
      source: isFree ? 'free' : 'program',
      programId: activeProgramId,
      durationSeconds: timing?.durationSeconds ?? yogaMeta?.duration_seconds,
      setsLogged: loggedEntries.reduce((n, entry: any) => n + entry.sets.length, 0),
    }))

    if (!isFree && activeProgramId) {
      // emitOnce guarda 'true'; el timestamp que se guardaba antes no lo leía nadie.
      emitOnce(`calistenia_program_started_${activeProgramId}_${userId}`, () => {
        op.track('program_started', { program_id: activeProgramId })
      })

      if (usePB && userId) void emitProgramMilestoneIfCompleted(userId, activeProgramId, workoutKey)
    }

    // Challenge scores are computed from the same workout/sets data. Emit a
    // lightweight progress event for each active challenge the workout can
    // actually move, without sending notes, health data, or free-form content.
    // Deliberately outside the program branch: free/manual sessions score
    // challenges too.
    if (usePB && userId) {
      const loggedExerciseIds = new Set<string>(
        Object.values(qc.getQueryData<ProgressData>(key)?.progress ?? {})
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
  }, [usePB, userId, activeProgramId, patchProgress, qc, key])

  // ─── markCardioDayDone ───────────────────────────────────────────────────
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

  // ─── unmarkWorkoutDone ───────────────────────────────────────────────────
  const unmarkWorkoutDone = useCallback(async (workoutKey: string, date?: string) => {
    const d = date || todayStr()
    const k = `done_${d}_${workoutKey}`
    // PB borra UNA sola sesión del día; el cache decrementa su conteo en 1 y
    // solo elimina la clave cuando llega a 0 (soporta repeticiones del día).
    patchProgress(prev => {
      const next = { ...prev }
      const entry = next[k] as SessionDone | undefined
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
          requestKey: null,
          filter: pb.filter(
            'user = {:uid} && workout_key = {:key} && completed_at >= {:from} && completed_at < {:to}',
            { uid: userId, key: workoutKey, from: dayStart, to: dayEnd },
          ),
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

  // ─── updateSettings ──────────────────────────────────────────────────────
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

  return { logSet, markWorkoutDone, unmarkWorkoutDone, markCardioDayDone, updateSettings }
}
