import { useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { op } from '../lib/analytics'
import { todayStr } from '../lib/dateUtils'
import { qk } from '../lib/query-keys'
import type { Challenge, ChallengeMetric, ChallengeStatus } from '../types'

export interface ChallengeWithMeta extends Challenge {
  participantCount: number
}

interface CreateChallengeData {
  title: string
  metric: ChallengeMetric
  custom_metric?: string
  description?: string
  goal?: number
  starts_at: string
  ends_at: string
  invitedUserIds: string[]
}

/** Resultado intermedio de la queryFn: retos + ids caducados detectados en lectura. */
interface ChallengesQueryResult {
  active: ChallengeWithMeta[]
  past: ChallengeWithMeta[]
  /** IDs de retos que están en estado 'active' pero ya pasaron su ends_at. */
  expiredIds: string[]
}

/** queryFn pura: lee participaciones, cuenta participantes y clasifica retos. */
async function fetchChallenges(userId: string): Promise<ChallengesQueryResult> {
  const available = await isPocketBaseAvailable()
  if (!available) return { active: [], past: [], expiredIds: [] }

  // Obtener todas las participaciones del usuario con el reto expandido
  const participations = await pb.collection('challenge_participants').getFullList({
    filter: pb.filter('user = {:uid}', { uid: userId }),
    expand: 'challenge',
    $autoCancel: false,
  })

  const today = todayStr()
  const challengeMap = new Map<string, ChallengeWithMeta>()
  const expiredIds: string[] = []

  for (const p of participations) {
    const c = (p as any).expand?.challenge
    if (!c) continue

    // Detectar retos caducados sin escribir desde la queryFn
    if (c.status === 'active' && c.ends_at < today) {
      expiredIds.push(c.id)
      // Reflejar el estado futuro localmente para la clasificación
      c.status = 'ended'
    }

    if (!challengeMap.has(c.id)) {
      challengeMap.set(c.id, {
        id: c.id,
        creator: c.creator,
        title: c.title,
        metric: c.metric as ChallengeMetric,
        custom_metric: c.custom_metric || '',
        description: c.description || '',
        goal: c.goal || 0,
        starts_at: c.starts_at,
        ends_at: c.ends_at,
        status: c.status as ChallengeStatus,
        participantCount: 0,
      })
    }
  }

  // Contar participantes por reto (N+1 necesario para el recuento exacto)
  const countPromises = Array.from(challengeMap.keys()).map(async (cid) => {
    try {
      const res = await pb.collection('challenge_participants').getList(1, 1, {
        filter: pb.filter('challenge = {:cid}', { cid }),
        $autoCancel: false,
      })
      const ch = challengeMap.get(cid)!
      ch.participantCount = res.totalItems
    } catch { /* ignorar errores individuales de conteo */ }
  })
  await Promise.all(countPromises)

  const all = Array.from(challengeMap.values())
  return {
    active: all.filter(c => c.status === 'active').sort((a, b) => a.ends_at.localeCompare(b.ends_at)),
    past: all.filter(c => c.status === 'ended').sort((a, b) => b.ends_at.localeCompare(a.ends_at)),
    expiredIds,
  }
}

export function useChallenges(userId: string | null) {
  const qc = useQueryClient()

  // ── Query principal ────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: qk.challenges(userId),
    enabled: !!userId,
    queryFn: () => fetchChallenges(userId!),
    staleTime: 30_000,
    // Retorno vacío mientras no hay datos
    placeholderData: { active: [], past: [], expiredIds: [] },
  })

  const active = data?.active ?? []
  const past = data?.past ?? []

  // ── Efecto de auto-cierre ─────────────────────────────────────────────────
  // El auto-end NO puede vivir en la queryFn (que debe ser pura/sin escrituras).
  // Este efecto corre una vez que la query resuelve y hay IDs caducados: hace las
  // escrituras a PocketBase y luego invalida la query para que se refleje el
  // estado 'ended' desde el servidor.
  useEffect(() => {
    const ids = data?.expiredIds ?? []
    if (!ids.length || !userId) return

    let cancelled = false

    ;(async () => {
      for (const id of ids) {
        if (cancelled) return
        try {
          await pb.collection('challenges').update(id, { status: 'ended' })
          op.track('challenge_completed', { challenge_id: id })
        } catch { /* solo el creador puede actualizar; ignorar si no lo es */ }
      }
      if (!cancelled) {
        // Refrescar la lista para que el servidor sea autoritativo
        await qc.invalidateQueries({ queryKey: qk.challenges(userId) })
      }
    })()

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.expiredIds, userId])

  // ── Mutación: crear reto ───────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async (createData: CreateChallengeData): Promise<string> => {
      if (!userId) throw new Error('Usuario no autenticado')

      const challenge = await pb.collection('challenges').create({
        creator: userId,
        title: createData.title,
        metric: createData.metric,
        custom_metric: createData.custom_metric || '',
        description: createData.description || '',
        goal: createData.goal || 0,
        starts_at: createData.starts_at,
        ends_at: createData.ends_at,
        status: 'active',
      })

      // Añadir creador + usuarios invitados como participantes
      const allParticipants = [userId, ...createData.invitedUserIds]
      await Promise.all(
        allParticipants.map(uid =>
          pb.collection('challenge_participants').create({
            challenge: challenge.id,
            user: uid,
          }).catch(() => {}) // ignorar duplicados
        )
      )

      op.track('challenge_created', {
        metric: createData.metric,
        duration_days: Math.ceil(
          (new Date(createData.ends_at).getTime() - new Date(createData.starts_at).getTime()) / 86400000
        ),
        participant_count: allParticipants.length,
      })

      return challenge.id
    },
    onSuccess: () => {
      // Invalidar la lista para que aparezca el nuevo reto
      qc.invalidateQueries({ queryKey: qk.challenges(userId) })
    },
    onError: (e) => {
      console.warn('Create challenge error:', e)
    },
  })

  // ── API pública (forma idéntica al hook original) ──────────────────────────
  /** Equivale al `load` del hook original; permite refetch manual. */
  const load = useCallback(() => {
    qc.invalidateQueries({ queryKey: qk.challenges(userId) })
  }, [qc, userId])

  /** Crea un reto y devuelve su ID, o null en caso de error (API original). */
  const createChallenge = useCallback(async (createData: CreateChallengeData): Promise<string | null> => {
    try {
      return await createMutation.mutateAsync(createData)
    } catch {
      return null
    }
  }, [createMutation])

  return {
    active,
    past,
    loading: isLoading,
    load,
    createChallenge,
  }
}
