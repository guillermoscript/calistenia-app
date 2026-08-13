import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pb, isPocketBaseAvailable, getUserAvatarUrl } from '../lib/pocketbase'
import { todayStr, toLocalDateStr, utcToLocalDateStr, localMidnightAsUTC, addDays } from '../lib/dateUtils'
import { localize } from '../lib/i18n-db'
import { computeExpressProgress, type ExpressProgressStats } from '../lib/express-progress'
import { qk } from '../lib/query-keys'
import type { Challenge } from '../types'

export interface ExpressProgress extends ExpressProgressStats {
  participantId: string
  participantName: string
  avatarUrl: string | null
}

/**
 * Retos express (gancho de referidos): "X reps de un ejercicio al día durante
 * N días". createExpress crea el reto con metric 'exercise' + exercise_slug,
 * así el leaderboard estándar de useChallengeDetail también puntúa (#313).
 */
export function useChallengeExpress(userId: string | null) {
  const qc = useQueryClient()

  const createMutation = useMutation<string | null, Error, {
    exerciseId: string; durationDays: number; dailyTarget: number; title?: string
  }>({
    mutationFn: async ({ exerciseId, durationDays, dailyTarget, title }) => {
      if (!userId) return null
      const available = await isPocketBaseAvailable()
      if (!available) return null

      let challengeTitle = title
      let exerciseSlug = ''
      try {
        const exercise = await pb.collection('exercises_catalog').getOne(exerciseId, { $autoCancel: false })
        exerciseSlug = (exercise as any).slug || ''
        if (!challengeTitle) {
          challengeTitle = `Challenge de ${localize((exercise as any).name, 'es')} — ${dailyTarget} x ${durationDays}d`
        }
      } catch {
        if (!challengeTitle) challengeTitle = `Challenge express — ${dailyTarget} x ${durationDays}d`
      }

      const today = new Date()
      const endDate = new Date(today)
      endDate.setDate(endDate.getDate() + durationDays)

      const challenge = await pb.collection('challenges').create({
        creator: userId,
        title: challengeTitle,
        metric: 'exercise',
        exercise_slug: exerciseSlug,
        starts_at: toLocalDateStr(today),
        ends_at: toLocalDateStr(endDate),
        status: 'active',
        type: 'express',
        exercise_id: exerciseId,
        daily_target: dailyTarget,
        duration_days: durationDays,
      })

      await pb.collection('challenge_participants').create({
        challenge: challenge.id,
        user: userId,
      }).catch(() => {}) // ignorar si duplicado

      return challenge.id
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.challenges(userId) })
    },
  })

  const createExpress = useCallback(
    async (exerciseId: string, durationDays: number, dailyTarget: number, title?: string): Promise<string | null> => {
      try {
        return await createMutation.mutateAsync({ exerciseId, durationDays, dailyTarget, title })
      } catch (e: any) {
        console.warn('Create express challenge error:', e)
        return null
      }
    },
    [createMutation],
  )

  return { createExpress }
}

// ── Progreso diario por participante ─────────────────────────────────────────

async function fetchExpressProgress(challenge: Challenge): Promise<ExpressProgress[]> {
  const available = await isPocketBaseAvailable()
  if (!available) return []

  // Los retos express nuevos guardan exercise_slug; los antiguos solo la
  // relación exercise_id, así que se resuelve el slug desde el catálogo.
  let slug = challenge.exercise_slug || ''
  if (!slug && challenge.exercise_id) {
    try {
      const ex = await pb.collection('exercises_catalog').getOne(challenge.exercise_id, { $autoCancel: false })
      slug = (ex as any).slug || ''
    } catch { /* catálogo no disponible */ }
  }
  if (!slug) return []

  const participants = await pb.collection('challenge_participants').getFullList({
    filter: pb.filter('challenge = {:cid}', { cid: challenge.id }),
    expand: 'user',
    $autoCancel: false,
  })

  const startStr = localMidnightAsUTC(challenge.starts_at)
  const endStr = localMidnightAsUTC(addDays(challenge.ends_at, 1))
  // ends_at = starts_at + duration_days (createExpress); el diff es el
  // fallback para retos antiguos sin duration_days.
  const durationDays = challenge.duration_days
    || Math.max(0, Math.round((new Date(challenge.ends_at).getTime() - new Date(challenge.starts_at).getTime()) / 86400000))
  const dailyTarget = challenge.daily_target || 0
  const today = todayStr()

  const entries = await Promise.all(
    participants.map(async (p: any) => {
      const user = p.expand?.user
      const participantName = user?.display_name || user?.email?.split('@')[0] || '?'

      let sets: Array<{ date: string; reps: string | null }> = []
      try {
        // `public_sets_log` y no `sets_log`: desde #410 la tabla base es
        // owner-only, así que leerla aquí devolvería cero filas para TODOS los
        // participantes menos uno mismo — y sin error, con el ranking entero a
        // cero. La view expone user, exercise_id, reps y logged_at, que es
        // exactamente lo que se pide aquí.
        const rows = await pb.collection('public_sets_log').getFullList({
          filter: pb.filter(
            'user = {:uid} && exercise_id = {:slug} && logged_at >= {:start} && logged_at <= {:end}',
            { uid: p.user, slug, start: startStr, end: endStr },
          ),
          fields: 'reps,logged_at',
          $autoCancel: false,
        })
        sets = rows.map((s: any) => ({ date: utcToLocalDateStr(s.logged_at), reps: s.reps || null }))
      } catch { /* sin sets */ }

      return {
        participantId: p.user as string,
        participantName,
        avatarUrl: user ? getUserAvatarUrl(user, '100x100') : null,
        ...computeExpressProgress(sets, challenge.starts_at, durationDays, dailyTarget, today),
      } satisfies ExpressProgress
    }),
  )

  return entries.sort((a, b) => b.daysCompleted - a.daysCompleted || b.currentStreak - a.currentStreak)
}

/**
 * Progreso diario de un reto express, por participante. Solo se activa cuando
 * el reto cargado es de tipo express con ejercicio asociado.
 */
export function useExpressProgress(challenge: Challenge | null) {
  const isExpress = !!challenge && challenge.type === 'express' && !!(challenge.exercise_slug || challenge.exercise_id)
  const query = useQuery({
    queryKey: qk.expressProgress(challenge?.id ?? ''),
    enabled: isExpress,
    queryFn: () => fetchExpressProgress(challenge!),
    staleTime: 30_000,
  })
  return { progress: query.data ?? [], loading: query.isLoading && isExpress }
}
