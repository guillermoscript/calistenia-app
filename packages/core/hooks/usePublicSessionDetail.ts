import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { pb, getUserAvatarUrl } from '../lib/pocketbase'
import { utcToLocalDateStr } from '../lib/dateUtils'
import { profileDisplayName } from '../lib/public-profile'
import { qk } from '../lib/query-keys'
import { buildSessionDetail } from './useSessionDetail'
import type { SessionDetailResult } from './useSessionDetail'
import type { ProgressMap, ExerciseLog, SessionDone } from '../types'
import type { TranslatableField } from '../lib/i18n-db'

export interface PublicSessionOwner {
  id: string
  displayName: string
  avatarUrl: string | null
}

export interface PublicSessionDetail extends SessionDetailResult {
  owner: PublicSessionOwner | null
  /** Wall-clock ms of the session, for "hace 2 h" style labels. */
  completedAt: number | null
  phase: number | null
}

/**
 * Ventana de holgura al pedir los sets de la sesión.
 *
 * `sets_log` no guarda la fecha local, solo `logged_at` (UTC), así que el día
 * se deriva con `utcToLocalDateStr` igual que en useProgress. Pedimos ±36 h
 * alrededor del cierre de la sesión para cubrir cualquier desfase de zona y
 * luego filtramos por día local en cliente — así el agrupado coincide con el
 * que ve el dueño en su propio detalle.
 */
const SLACK_MS = 36 * 60 * 60 * 1000

function pbDateTime(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19)
}

/**
 * Detalle completo de una sesión de fuerza a partir del id de registro,
 * reconstruido desde PocketBase para que funcione con la sesión de CUALQUIER
 * usuario (el muro y la actividad reciente enlazan aquí).
 *
 * El detalle propio (`useSessionDetail`) sale del ProgressMap ya cargado en
 * memoria; este hook rehace ese mismo mapa pero solo con los registros de la
 * sesión pedida, y comparte la reconstrucción vía `buildSessionDetail` para que
 * ambas vistas muestren exactamente los mismos datos.
 *
 * Lee de las views `public_sessions` / `public_sets_log` (#386): las tablas base
 * son owner-only y esta pantalla se abre sobre la sesión de otra persona. La
 * view expone lo que este detalle pinta y deja fuera la frecuencia cardiaca.
 */
export function usePublicSessionDetail(
  sessionId: string | null,
  exerciseCatalog: Record<string, { name: TranslatableField; muscles: TranslatableField }>,
) {
  const query = useQuery({
    queryKey: qk.publicSession(sessionId),
    enabled: !!sessionId,
    staleTime: 60_000,
    queryFn: async () => {
      const rec: any = await pb.collection('public_sessions').getOne(sessionId!, {
        expand: 'user',
        $autoCancel: false,
      })

      const completedRaw = rec.completed_at || rec.created
      const date = utcToLocalDateStr(completedRaw)
      const workoutKey = rec.workout_key as string
      const ownerId = rec.user as string

      // Reconstruir la entrada `done_` tal cual la deja useProgress.loadFromPB.
      const sessionEntry: SessionDone = {
        done: true,
        date,
        workoutKey,
        note: rec.note || '',
      }
      if (rec.warmup_skipped || rec.warmup_completed || rec.warmup_duration_seconds) {
        sessionEntry.warmupCompleted = !!rec.warmup_completed
        sessionEntry.warmupSkipped = !!rec.warmup_skipped
        sessionEntry.warmupDurationSeconds = rec.warmup_duration_seconds || 0
      }
      if (rec.cooldown_skipped || rec.cooldown_completed || rec.cooldown_duration_seconds) {
        sessionEntry.cooldownCompleted = !!rec.cooldown_completed
        sessionEntry.cooldownSkipped = !!rec.cooldown_skipped
        sessionEntry.cooldownDurationSeconds = rec.cooldown_duration_seconds || 0
      }
      if (rec.duration_seconds != null || rec.poses_completed != null || rec.total_poses != null) {
        sessionEntry.durationSeconds = rec.duration_seconds ?? undefined
        sessionEntry.posesCompleted = rec.poses_completed ?? undefined
        sessionEntry.totalPoses = rec.total_poses ?? undefined
      }
      if (Array.isArray(rec.exercise_timings) && rec.exercise_timings.length > 0) {
        sessionEntry.exerciseTimings = rec.exercise_timings
      }

      const progress: ProgressMap = { [`done_${date}_${workoutKey}`]: sessionEntry }

      // Sets del dueño para ese workout_key en la ventana del día.
      const completedMs = new Date(completedRaw).getTime()
      const setsRes = await pb.collection('public_sets_log').getFullList({
        filter: pb.filter(
          'user = {:uid} && workout_key = {:wk} && logged_at >= {:from} && logged_at <= {:to}',
          {
            uid: ownerId,
            wk: workoutKey,
            from: pbDateTime(completedMs - SLACK_MS),
            to: pbDateTime(completedMs + SLACK_MS),
          },
        ),
        sort: '-logged_at',
        $autoCancel: false,
      }).catch(() => [] as any[])

      setsRes.forEach((s: any) => {
        const loggedRaw = s.logged_at || s.created
        if (utcToLocalDateStr(loggedRaw) !== date) return
        const k = `${date}_${s.workout_key}_${s.exercise_id}`
        if (!progress[k]) {
          progress[k] = { sets: [], date, workoutKey: s.workout_key, exerciseId: s.exercise_id }
        }
        ;(progress[k] as ExerciseLog).sets.push({
          reps: s.reps,
          note: s.note,
          weight: s.weight_kg || undefined,
          rpe: s.rpe || undefined,
          timestamp: new Date(loggedRaw).getTime(),
        })
      })

      // getFullList llega en orden descendente; buildSessionDetail numera las
      // series por posición, así que hay que dejarlas en orden de ejecución.
      Object.values(progress).forEach(entry => {
        const log = entry as ExerciseLog
        if (log.sets) log.sets.sort((a, b) => a.timestamp - b.timestamp)
      })

      // Las sesiones de programa registran los ejercicios con ids de slot
      // ("lun_1_2"), cuyos nombres solo existen en el programa. El dueño los
      // resuelve desde su WorkoutsMap ya cargado; para una sesión ajena hay que
      // leerlos de PB o la tabla mostraría ids crudos.
      const programCatalog: Record<string, { name: TranslatableField; muscles: TranslatableField }> = {}
      const wkMatch = /^p(\d+)_(.+)$/.exec(workoutKey)
      if (rec.program && wkMatch) {
        const progExRes = await pb.collection('program_exercises').getFullList({
          filter: pb.filter('program = {:pid} && phase_number = {:ph} && day_id = {:day}', {
            pid: rec.program,
            ph: parseInt(wkMatch[1], 10),
            day: wkMatch[2],
          }),
          $autoCancel: false,
        }).catch(() => [] as any[])
        progExRes.forEach((r: any) => {
          programCatalog[r.exercise_id] = { name: r.exercise_name ?? '', muscles: r.muscles ?? '' }
        })
      }

      const u = rec.expand?.user
      const owner: PublicSessionOwner | null = u
        ? {
            id: u.id,
            // `profileDisplayName` y no `display_name || email`: quien se dio de
            // alta con Google rellena `name`, no `display_name`, y además
            // users_field_privacy.pb.js (#411) ESCONDE el email pero publica
            // `name` — sin ese escalón el autor salía como «?».
            displayName: profileDisplayName(u) || '?',
            avatarUrl: getUserAvatarUrl(u, '200x200'),
          }
        : { id: ownerId, displayName: '?', avatarUrl: null }

      return {
        progress,
        date,
        workoutKey,
        owner,
        programCatalog,
        completedAt: completedMs || null,
        phase: rec.phase ?? null,
      }
    },
  })

  const data = query.data

  const result = useMemo<PublicSessionDetail>(() => {
    // Los nombres del programa pisan al catálogo estático/PB: son los únicos que
    // conocen los ids de slot de ese día.
    const detail: SessionDetailResult = data
      ? buildSessionDetail(data.progress, data.date, data.workoutKey, {
          ...exerciseCatalog,
          ...data.programCatalog,
        })
      : { session: null, exercises: [] }
    return {
      ...detail,
      owner: data?.owner ?? null,
      completedAt: data?.completedAt ?? null,
      phase: data?.phase ?? null,
    }
  }, [data, exerciseCatalog])

  return {
    ...result,
    loading: query.isLoading,
    error: query.error as Error | null,
    notFound: !!query.error,
  }
}
