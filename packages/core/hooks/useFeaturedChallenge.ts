/**
 * Reto destacado en Home (#351) — datos + acción de unirse, compartidos por
 * web y móvil. La selección vive en lib/featured-challenge.ts (pura); aquí
 * solo se orquesta PocketBase + TanStack Query.
 */
import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from '../lib/analytics'
import { todayStr } from '../lib/dateUtils'
import { qk } from '../lib/query-keys'
import {
  FEATURED_CHALLENGE_SOURCE,
  FEATURED_CHALLENGE_SURFACE,
  pickFeaturedChallenge,
  type FeaturedChallengeCard,
} from '../lib/featured-challenge'
import type { Challenge, ChallengeMetric, ChallengeStatus } from '../types'

export interface FeaturedChallengeResult {
  card: FeaturedChallengeCard | null
  participantCount: number
}

/** queryFn pura: candidatos destacados + participaciones del usuario → card. */
async function fetchFeaturedChallenge(userId: string): Promise<FeaturedChallengeResult> {
  const available = await isPocketBaseAvailable()
  if (!available) return { card: null, participantCount: 0 }

  // Pocos retos destacados a la vez (curación manual): 10 candidatos bastan.
  const res = await pb.collection('challenges').getList(1, 10, {
    filter: 'is_featured = true',
    sort: '-ends_at',
    $autoCancel: false,
  })
  if (res.items.length === 0) return { card: null, participantCount: 0 }

  const candidates: Challenge[] = res.items.map((c: any) => ({
    id: c.id,
    creator: c.creator,
    title: c.title,
    metric: c.metric as ChallengeMetric,
    custom_metric: c.custom_metric || '',
    exercise_slug: c.exercise_slug || '',
    description: c.description || '',
    goal: c.goal || 0,
    starts_at: c.starts_at,
    ends_at: c.ends_at,
    status: c.status as ChallengeStatus,
  }))

  // Participaciones del usuario solo entre los candidatos.
  const idFilter = candidates.map((_, i) => `challenge = {:c${i}}`).join(' || ')
  const params = Object.fromEntries(candidates.map((c, i) => [`c${i}`, c.id]))
  const participations = await pb.collection('challenge_participants').getFullList({
    filter: pb.filter(`user = {:uid} && (${idFilter})`, { uid: userId, ...params }),
    $autoCancel: false,
  })
  const joinedIds = new Set(participations.map((p: any) => p.challenge as string))

  const card = pickFeaturedChallenge(candidates, joinedIds, todayStr())
  if (!card) return { card: null, participantCount: 0 }

  // Recuento de participantes solo para el reto elegido.
  let participantCount = 0
  try {
    const count = await pb.collection('challenge_participants').getList(1, 1, {
      filter: pb.filter('challenge = {:cid}', { cid: card.challenge.id }),
      $autoCancel: false,
    })
    participantCount = count.totalItems
  } catch { /* el recuento es decorativo; no tumba la card */ }

  return { card, participantCount }
}

export function useFeaturedChallenge(userId: string | null) {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: qk.featuredChallenge(userId),
    enabled: !!userId,
    queryFn: () => fetchFeaturedChallenge(userId!),
    staleTime: 60_000,
    // La card nunca debe romper Home: cualquier error degrada a "sin card".
    retry: 1,
    placeholderData: { card: null, participantCount: 0 },
  })

  const joinMutation = useMutation({
    mutationFn: async (challengeId: string) => {
      if (!userId) throw new Error('Usuario no autenticado')
      // Idempotente: el índice único (challenge, user) convierte duplicados en 400.
      await pb.collection('challenge_participants')
        .create({ challenge: challengeId, user: userId })
        .catch(() => {})
      trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.challengeJoined, {
        surface: FEATURED_CHALLENGE_SURFACE,
        source: FEATURED_CHALLENGE_SOURCE,
        challenge_id: challengeId,
        participant_count: (data?.participantCount ?? 0) + 1,
        result: 'joined',
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.featuredChallenge(userId) })
      qc.invalidateQueries({ queryKey: qk.challenges(userId) })
    },
  })

  /** Une al usuario al reto destacado; resuelve aunque ya participara. */
  const join = useCallback(async (challengeId: string) => {
    try {
      await joinMutation.mutateAsync(challengeId)
    } catch { /* degradar en silencio: la card sigue navegando al detalle */ }
  }, [joinMutation])

  return {
    card: data?.card ?? null,
    participantCount: data?.participantCount ?? 0,
    loading: isLoading,
    joining: joinMutation.isPending,
    join,
  }
}
