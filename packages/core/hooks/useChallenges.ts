import { useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { CANONICAL_ANALYTICS_EVENTS, op, trackCanonicalEvent } from '../lib/analytics'
import { todayStr } from '../lib/dateUtils'
import { qk } from '../lib/query-keys'
import {
  findExistingPresetChallenge,
  getBeginnerChallengePreset,
  getPresetDateRange,
  getPresetDescription,
  getPresetTitle,
  type PresetParticipantRecord,
} from '../lib/challenge-presets'
import type { Challenge, ChallengeMetric, ChallengeStatus } from '../types'

export interface ChallengeWithMeta extends Challenge {
  participantCount: number
}

interface CreateChallengeData {
  title: string
  metric: ChallengeMetric
  custom_metric?: string
  exercise_slug?: string
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

export interface PresetJoinResult {
  challengeId: string
  alreadyJoined: boolean
  startsAt: string
  endsAt: string
}

async function findUserPresetChallenge(userId: string, presetId: string) {
  const records = await pb.collection('challenge_participants').getFullList({
    filter: pb.filter('user = {:uid}', { uid: userId }),
    expand: 'challenge',
    $autoCancel: false,
  })
  return findExistingPresetChallenge(records as PresetParticipantRecord[], presetId)
}

async function findOwnedPresetChallenge(userId: string, presetId: string) {
  try {
    return await pb.collection('challenges').getFirstListItem(
      pb.filter('creator = {:uid} && preset_key = {:preset} && status = "active"', { uid: userId, preset: presetId }),
      { $autoCancel: false },
    ) as any
  } catch {
    return null
  }
}

/**
 * Garantiza la fila de participante. Un create duplicado es benigno (otra
 * pestaña/dispositivo ganó la carrera), pero solo podemos ignorarlo si la fila
 * existe de verdad: tragarse el error a ciegas deja al usuario "unido" a un reto
 * en el que no participa y sin progreso posible.
 */
async function ensureParticipant(challengeId: string, userId: string) {
  try {
    await pb.collection('challenge_participants').create({ challenge: challengeId, user: userId })
  } catch (error) {
    const existing = await pb.collection('challenge_participants').getList(1, 1, {
      filter: pb.filter('challenge = {:cid} && user = {:uid}', { cid: challengeId, uid: userId }),
      $autoCancel: false,
    }).catch(() => null)
    if (!existing?.totalItems) throw error
  }
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
        exercise_slug: c.exercise_slug || '',
        description: c.description || '',
        goal: c.goal || 0,
        starts_at: c.starts_at,
        ends_at: c.ends_at,
        status: c.status as ChallengeStatus,
        preset_key: c.preset_key || undefined,
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
          trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.challengeCompleted, {
            surface: 'challenge',
            source: 'challenge_expired',
            challenge_id: id,
            result: 'completed',
          })
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
        exercise_slug: createData.exercise_slug || '',
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

  // ── Mutación: unirse a un preset de principiante ─────────────────────────
  const joinPresetMutation = useMutation({
    mutationFn: async (presetId: string): Promise<PresetJoinResult> => {
      if (!userId) throw new Error('Usuario no autenticado')

      const preset = getBeginnerChallengePreset(presetId)
      if (!preset || !preset.enabled) throw new Error('Preset no disponible')
      const dates = getPresetDateRange(preset)

      const existing = await findUserPresetChallenge(userId, preset.id)
      if (existing) {
        return {
          challengeId: existing.id,
          alreadyJoined: true,
          startsAt: existing.starts_at || '',
          endsAt: existing.ends_at || '',
        }
      }

      // Repair a challenge created by a previous interrupted request before
      // creating another record. The participant unique index makes this safe
      // if another device repaired it first.
      const owned = await findOwnedPresetChallenge(userId, preset.id)
      if (owned) {
        await ensureParticipant(owned.id, userId)
        return {
          challengeId: owned.id,
          alreadyJoined: true,
          startsAt: owned.starts_at || dates.startsAt,
          endsAt: owned.ends_at || dates.endsAt,
        }
      }

      let challenge: any
      try {
        challenge = await pb.collection('challenges').create({
          creator: userId,
          title: getPresetTitle(preset),
          metric: preset.metric,
          // `total_exercise`/`exercise` puntúan un ejercicio concreto: sin el
          // slug el detalle daría 0 para siempre (#345, Push-up Builder).
          exercise_slug: preset.exerciseSlug ?? '',
          description: getPresetDescription(preset),
          goal: preset.goal,
          starts_at: dates.startsAt,
          ends_at: dates.endsAt,
          status: 'active',
          type: 'standard',
          preset_key: preset.id,
        })
      } catch (error) {
        // A second tap/device can win the unique creator+preset race. Re-read
        // the participant list and turn that race into an idempotent result.
        const raced = await findUserPresetChallenge(userId, preset.id) || await findOwnedPresetChallenge(userId, preset.id)
        if (raced) {
          await ensureParticipant(raced.id, userId)
          return {
            challengeId: raced.id,
            alreadyJoined: true,
            startsAt: raced.starts_at || dates.startsAt,
            endsAt: raced.ends_at || dates.endsAt,
          }
        }
        throw error
      }

      try {
        await ensureParticipant(challenge.id, userId)
      } catch (error) {
        // Avoid leaving a user-owned orphan when the participant write fails.
        await pb.collection('challenges').delete(challenge.id).catch(() => {})
        throw error
      }

      trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.challengeJoined, {
        surface: 'challenge_preset_catalog',
        source: preset.id,
        challenge_id: challenge.id,
        participant_count: 1,
        result: 'joined',
      })

      return {
        challengeId: challenge.id,
        alreadyJoined: false,
        startsAt: dates.startsAt,
        endsAt: dates.endsAt,
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.challenges(userId) })
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

  /**
   * Propaga el error a propósito: quien llama tiene que poder avisar al usuario.
   * Devolver null en silencio convertía un fallo de unión en un botón mudo.
   */
  const joinPreset = useCallback(async (presetId: string): Promise<PresetJoinResult> => {
    return await joinPresetMutation.mutateAsync(presetId)
  }, [joinPresetMutation])

  return {
    active,
    past,
    loading: isLoading,
    load,
    createChallenge,
    joinPreset,
  }
}
