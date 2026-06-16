import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pb, isPocketBaseAvailable, getUserAvatarUrl } from '../lib/pocketbase'
import { op } from '../lib/analytics'
import { localMidnightAsUTC, addDays, utcToLocalDateStr } from '../lib/dateUtils'
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
    description: ch.description || '',
    goal: ch.goal || 0,
    starts_at: ch.starts_at,
    ends_at: ch.ends_at,
    status: ch.status as any,
  }
}

// ── queryFn: leaderboard (dependiente del reto) ────────────────────────────────

interface LeaderboardQueryResult {
  entries: LeaderboardEntry[]
  participantIds: Set<string>
}

async function fetchLeaderboard(
  challengeId: string,
  challenge: Challenge,
  currentUserId: string,
): Promise<LeaderboardQueryResult> {
  const available = await isPocketBaseAvailable()
  if (!available) return { entries: [], participantIds: new Set() }

  // Obtener participantes con usuario expandido
  const participants = await pb.collection('challenge_participants').getFullList({
    filter: pb.filter('challenge = {:cid}', { cid: challengeId }),
    expand: 'user',
    $autoCancel: false,
  })

  const participantIds = new Set(participants.map((p: any) => p.user as string))

  // Calcular scores en paralelo (N+1 intencional, se mantiene como en el original)
  const startStr = localMidnightAsUTC(challenge.starts_at)
  const endStr = localMidnightAsUTC(addDays(challenge.ends_at, 1))

  const entries = await Promise.all(
    participants.map(async (p: any) => {
      const user = p.expand?.user
      const uid = p.user as string
      const displayName = user?.display_name || user?.email?.split('@')[0] || '?'

      let value = 0
      try {
        value = await getScore(uid, challenge.metric, startStr, endStr)
      } catch { /* valor por defecto 0 */ }

      return {
        userId: uid,
        displayName,
        avatarUrl: user ? getUserAvatarUrl(user, '100x100') : null,
        value,
        isCurrentUser: uid === currentUserId,
      } satisfies LeaderboardEntry
    })
  )

  return {
    entries: entries.sort((a, b) => b.value - a.value),
    participantIds,
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
  const participantIds = leaderboardQuery.data?.participantIds ?? new Set<string>()

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
      op.track('challenge_joined', { challenge_id: challengeId })
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
    loading,
    participantIds,
    load,
    inviteUser,
  }
}

// ── Cálculo de score por métrica ──────────────────────────────────────────────

async function getScore(uid: string, metric: ChallengeMetric, startStr: string, endStr: string): Promise<number> {
  switch (metric) {
    case 'most_sessions': {
      const res = await pb.collection('sessions').getList(1, 1, {
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
      const settings = await pb.collection('settings').getFirstListItem(
        pb.filter('user = {:uid}', { uid }),
        { $autoCancel: false },
      )
      return (settings as any)[fieldMap[metric]] || 0
    }
    case 'longest_streak': {
      const sessions = await pb.collection('sessions').getFullList({
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
