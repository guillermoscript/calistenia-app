import { useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pb, isPocketBaseAvailable, getUserAvatarUrl } from '../lib/pocketbase'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from '../lib/analytics'
import { localMidnightAsUTC, addDays, utcToLocalDateStr } from '../lib/dateUtils'
import { parseRepsForPR } from '../lib/pr-utils'
import { sumExerciseTotal, countWorkouts, sumDistanceKm, compareLeaderboardEntries } from '../lib/cumulative-scoring'
import { qk } from '../lib/query-keys'
import type { Challenge, ChallengeMetric } from '../types'
import type { LeaderboardEntry } from './useLeaderboard'

// ── queryFn: detalle del reto ─────────────────────────────────────────────────

async function fetchChallenge(challengeId: string): Promise<Challenge> {
  const available = await isPocketBaseAvailable()
  if (!available) throw new Error('PocketBase no disponible')

  const ch = await pb.collection('challenges').getOne(challengeId, { $autoCancel: false })
  return {
    id: ch.id,
    creator: ch.creator,
    title: ch.title,
    metric: ch.metric as ChallengeMetric,
    custom_metric: ch.custom_metric || '',
    exercise_slug: ch.exercise_slug || '',
    description: ch.description || '',
    goal: ch.goal || 0,
    starts_at: ch.starts_at,
    ends_at: ch.ends_at,
    status: ch.status as any,
    preset_key: ch.preset_key || undefined,
    type: (ch.type as any) || 'standard',
    exercise_id: ch.exercise_id || '',
    daily_target: ch.daily_target || 0,
    duration_days: ch.duration_days || 0,
  }
}

// ── queryFn: leaderboard (dependiente del reto) ────────────────────────────────

// participantIds va como array y no como Set: el caché de queries se persiste
// en JSON (localStorage/MMKV) y un Set rehidratado vuelve como `{}`, lo que
// reventaba `.has()` al recargar la página con caché persistido.
interface LeaderboardQueryResult {
  entries: LeaderboardEntry[]
  participantIds: string[]
  /**
   * Participantes con cuenta privada (#422) que NO salen en el ranking para
   * los demás. Como Strava: la actividad no pública queda fuera del
   * leaderboard en vez de recalcularse por espectador. El propio usuario
   * privado sí se ve a sí mismo (entrada con `isPrivate: true`).
   */
  hiddenPrivateCount: number
}

/** Exportada para testearla en node (core no renderiza hooks). */
export async function fetchLeaderboard(
  challengeId: string,
  challenge: Challenge,
  currentUserId: string,
): Promise<LeaderboardQueryResult> {
  const available = await isPocketBaseAvailable()
  if (!available) return { entries: [], participantIds: [], hiddenPrivateCount: 0 }

  // Obtener participantes con usuario expandido
  const participants = await pb.collection('challenge_participants').getFullList({
    filter: pb.filter('challenge = {:cid}', { cid: challengeId }),
    expand: 'user',
    $autoCancel: false,
  })

  const participantIds = participants.map((p: any) => p.user as string)

  // Calcular scores en paralelo (N+1 intencional, se mantiene como en el original)
  const startStr = localMidnightAsUTC(challenge.starts_at)
  const endStr = localMidnightAsUTC(addDays(challenge.ends_at, 1))

  // Las cuentas privadas no compiten en público: fuera del ranking salvo para
  // sí mismas. Se decide ANTES de pedir los scores: para un espectador sin
  // follow aceptado las views `public_*` devuelven 0 filas en silencio y el
  // privado aparecería clavado a 0 en el último puesto, que es peor que no
  // aparecer.
  const visible = participants.filter((p: any) => {
    const isPrivate = p.expand?.user?.is_private === true
    return !isPrivate || p.user === currentUserId
  })
  const hiddenPrivateCount = participants.length - visible.length

  const ranked = await Promise.all(
    visible.map(async (p: any) => {
      const user = p.expand?.user
      const uid = p.user as string
      const displayName = user?.display_name || user?.email?.split('@')[0] || '?'

      let value = 0
      try {
        value = await getScore(uid, challenge.metric, startStr, endStr, challenge.exercise_slug)
      } catch { /* valor por defecto 0 */ }

      return {
        entry: {
          userId: uid,
          displayName,
          avatarUrl: user ? getUserAvatarUrl(user, '100x100') : null,
          value,
          isCurrentUser: uid === currentUserId,
          isPrivate: user?.is_private === true,
        } satisfies LeaderboardEntry,
        // Desempate determinista: quien se unió antes gana; ver compareLeaderboardEntries.
        joinedAt: (p.created as string) || '',
      }
    })
  )

  ranked.sort((a, b) => compareLeaderboardEntries(
    { value: a.entry.value, joinedAt: a.joinedAt, userId: a.entry.userId },
    { value: b.entry.value, joinedAt: b.joinedAt, userId: b.entry.userId },
  ))

  return {
    entries: ranked.map(r => r.entry),
    participantIds,
    hiddenPrivateCount,
  }
}

// ── Hook principal ────────────────────────────────────────────────────────────

export function useChallengeDetail(challengeId: string | null, currentUserId: string | null) {
  const qc = useQueryClient()

  // ── Query 1: datos del reto ────────────────────────────────────────────────
  const challengeQuery = useQuery({
    queryKey: qk.challenge(challengeId ?? ''),
    enabled: !!challengeId,
    queryFn: () => fetchChallenge(challengeId!),
    staleTime: 30_000,
  })

  const challenge = challengeQuery.data ?? null

  // ── Query 2: leaderboard (dependiente del reto) ────────────────────────────
  // Solo se activa cuando el reto ya está cargado y hay usuario actual
  const leaderboardQuery = useQuery({
    queryKey: qk.challengeLeaderboard(challengeId ?? '', currentUserId),
    enabled: !!challengeId && !!currentUserId && !!challenge,
    queryFn: () => fetchLeaderboard(challengeId!, challenge!, currentUserId!),
    staleTime: 30_000,
  })

  const leaderboard = leaderboardQuery.data?.entries ?? []
  const hiddenPrivateCount = leaderboardQuery.data?.hiddenPrivateCount ?? 0
  // La API pública sigue exponiendo un Set (los consumidores usan `.has`); se
  // reconstruye aquí porque en el caché solo viven datos JSON-serializables.
  // El guard Array.isArray sanea entradas viejas de la caché persistida donde
  // participantIds era un Set y se restauró como `{}` (no iterable).
  const rawParticipantIds = leaderboardQuery.data?.participantIds
  const participantIds = useMemo(
    () => new Set<string>(Array.isArray(rawParticipantIds) ? rawParticipantIds : []),
    [rawParticipantIds],
  )

  // loading = true mientras cualquiera de las dos queries esté en vuelo
  const loading = challengeQuery.isLoading || leaderboardQuery.isLoading

  // ── Mutación: invitar usuario ──────────────────────────────────────────────
  const inviteMutation = useMutation({
    mutationFn: async (targetUserId: string): Promise<void> => {
      if (!challengeId) throw new Error('challengeId requerido')
      await pb.collection('challenge_participants').create({
        challenge: challengeId,
        user: targetUserId,
      })
      // Esto corre en el dispositivo de QUIEN invita, con su identidad de
      // analytics: emitir `challenge_joined` aquí le atribuiría una unión que no
      // ha hecho (y a los invitados, ninguna). La acción real es un envío de
      // invitación.
      trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.inviteSent, {
        surface: 'challenge_detail',
        source: 'challenge_invite',
        challenge_id: challengeId,
        result: 'sent',
      })
    },
    onSuccess: () => {
      // Invalidar el leaderboard para que aparezca el nuevo participante
      qc.invalidateQueries({ queryKey: qk.challengeLeaderboard(challengeId ?? '', currentUserId) })
    },
  })

  // ── API pública (forma idéntica al hook original) ──────────────────────────

  /** Equivale al `load` del hook original; fuerza refetch manual de ambas queries. */
  const load = useCallback(() => {
    if (!challengeId) return
    qc.invalidateQueries({ queryKey: qk.challenge(challengeId) })
    qc.invalidateQueries({ queryKey: qk.challengeLeaderboard(challengeId, currentUserId) })
  }, [qc, challengeId, currentUserId])

  /** Invita a un usuario y devuelve true/false (API original). */
  const inviteUser = useCallback(async (targetUserId: string): Promise<boolean> => {
    try {
      await inviteMutation.mutateAsync(targetUserId)
      return true
    } catch {
      return false
    }
  }, [inviteMutation])

  return {
    challenge,
    leaderboard,
    hiddenPrivateCount,
    loading,
    participantIds,
    load,
    inviteUser,
  }
}

// ── Cálculo de score por métrica ──────────────────────────────────────────────

async function getScore(uid: string, metric: ChallengeMetric, startStr: string, endStr: string, exerciseSlug?: string): Promise<number> {
  switch (metric) {
    case 'exercise': {
      // Mejor set del ejercicio del reto dentro de la ventana. Los scores se
      // calculan sobre datos de OTROS participantes, así que todo este bloque
      // lee de las views `public_*` (#386) y no de las tablas base, que desde
      // 1783500000_public_read_views.js son owner-only.
      if (!exerciseSlug) return 0
      const sets = await pb.collection('public_sets_log').getFullList({
        filter: pb.filter(
          'user = {:uid} && exercise_id = {:eid} && logged_at >= {:start} && logged_at <= {:end}',
          { uid, eid: exerciseSlug, start: startStr, end: endStr },
        ),
        fields: 'reps',
        $autoCancel: false,
      })
      let best = 0
      for (const s of sets) {
        const n = parseRepsForPR((s as any).reps)
        if (n != null && n > best) best = n
      }
      return best
    }
    case 'most_sessions': {
      const res = await pb.collection('public_sessions').getList(1, 1, {
        filter: pb.filter('user = {:uid} && completed_at >= {:start} && completed_at <= {:end}', { uid, start: startStr, end: endStr }),
        $autoCancel: false,
      })
      return res.totalItems
    }
    case 'most_pullups':
    case 'most_pushups':
    case 'most_lsit':
    case 'most_handstand': {
      const fieldMap: Record<string, string> = {
        most_pullups: 'pr_pullups',
        most_pushups: 'pr_pushups',
        most_lsit: 'pr_lsit',
        most_handstand: 'pr_handstand',
      }
      const settings = await pb.collection('public_prs').getFirstListItem(
        pb.filter('user = {:uid}', { uid }),
        { $autoCancel: false },
      )
      return (settings as any)[fieldMap[metric]] || 0
    }
    // ── Métricas acumulativas (#352): recomputadas desde registros canónicos ──
    // en cada fetch, así ediciones/borrados se reflejan y los refrescos son
    // idempotentes. La ventana es la misma que el resto del leaderboard.
    case 'total_exercise': {
      if (!exerciseSlug) return 0
      const sets = await pb.collection('public_sets_log').getFullList({
        filter: pb.filter(
          'user = {:uid} && exercise_id = {:eid} && logged_at >= {:start} && logged_at <= {:end}',
          { uid, eid: exerciseSlug, start: startStr, end: endStr },
        ),
        // `id` es imprescindible: es la clave de dedupe de sumExerciseTotal.
        fields: 'id,reps',
        $autoCancel: false,
      })
      return sumExerciseTotal(sets as any)
    }
    case 'total_workouts': {
      const [sessions, cardio] = await Promise.all([
        pb.collection('public_sessions').getFullList({
          filter: pb.filter('user = {:uid} && completed_at >= {:start} && completed_at <= {:end}', { uid, start: startStr, end: endStr }),
          fields: 'workout_key,completed_at',
          $autoCancel: false,
        }),
        pb.collection('public_cardio_sessions').getFullList({
          filter: pb.filter('user = {:uid} && started_at >= {:start} && started_at <= {:end}', { uid, start: startStr, end: endStr }),
          fields: 'id,started_at',
          $autoCancel: false,
        }).catch(() => []),
      ])
      return countWorkouts(sessions as any, cardio as any, utcToLocalDateStr)
    }
    case 'total_distance': {
      const cardio = await pb.collection('public_cardio_sessions').getFullList({
        filter: pb.filter('user = {:uid} && started_at >= {:start} && started_at <= {:end}', { uid, start: startStr, end: endStr }),
        fields: 'id,distance_km',
        $autoCancel: false,
      }).catch(() => [])
      return sumDistanceKm(cardio as any)
    }
    case 'longest_streak': {
      const sessions = await pb.collection('public_sessions').getFullList({
        filter: pb.filter('user = {:uid} && completed_at >= {:start} && completed_at <= {:end}', { uid, start: startStr, end: endStr }),
        sort: 'completed_at',
        $autoCancel: false,
      })
      const dates = [...new Set(sessions.map((s: any) => s.completed_at ? utcToLocalDateStr(s.completed_at) : ''))]
        .filter(Boolean)
        .sort()
      if (dates.length === 0) return 0
      let max = 1, streak = 1
      for (let i = 1; i < dates.length; i++) {
        const diff = (new Date(dates[i]).getTime() - new Date(dates[i - 1]).getTime()) / 86400000
        if (diff === 1) { streak++; max = Math.max(max, streak) } else streak = 1
      }
      return max
    }
    default:
      return 0
  }
}
