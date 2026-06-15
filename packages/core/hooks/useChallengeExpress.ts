import { useState, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { todayStr, toLocalDateStr } from '../lib/dateUtils'
import { localize } from '../lib/i18n-db'
import { qk } from '../lib/query-keys'

export interface ExpressProgress {
  participantId: string
  participantName: string
  daysCompleted: number
  totalDays: number
  currentStreak: number
  dailyProgress: Array<{ date: string; value: number; completed: boolean }>
}

/**
 * Retos express. Migrado a TanStack Query conservando la forma pública
 * { loading, createExpress, getProgress }. createExpress es una mutation que
 * invalida challenges; getProgress lee vía qc.fetchQuery (dedup + staleTime 30s).
 */
export function useChallengeExpress(userId: string | null) {
  const qc = useQueryClient()
  const [loading, setLoading] = useState(false)

  const createMutation = useMutation<string | null, Error, {
    exerciseId: string; durationDays: number; dailyTarget: number; title?: string
  }>({
    mutationFn: async ({ exerciseId, durationDays, dailyTarget, title }) => {
      if (!userId) return null
      const available = await isPocketBaseAvailable()
      if (!available) return null

      let challengeTitle = title
      if (!challengeTitle) {
        try {
          const exercise = await pb.collection('exercises_catalog').getOne(exerciseId, { $autoCancel: false })
          challengeTitle = `Challenge de ${localize((exercise as any).name, 'es')} — ${dailyTarget} x ${durationDays}d`
        } catch {
          challengeTitle = `Challenge express — ${dailyTarget} x ${durationDays}d`
        }
      }

      const today = new Date()
      const endDate = new Date(today)
      endDate.setDate(endDate.getDate() + durationDays)

      const challenge = await pb.collection('challenges').create({
        creator: userId,
        title: challengeTitle,
        metric: 'reps',
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

  const getProgress = useCallback(async (challengeId: string): Promise<ExpressProgress[]> => {
    const available = await isPocketBaseAvailable()
    if (!available) return []
    setLoading(true)
    try {
      return await qc.fetchQuery({
        queryKey: qk.expressProgress(challengeId),
        staleTime: 30_000,
        queryFn: async (): Promise<ExpressProgress[]> => {
          const challenge = await pb.collection('challenges').getOne(challengeId, { $autoCancel: false }) as any
          if (challenge.type !== 'express' || !challenge.exercise_id) return []

          const participants = await pb.collection('challenge_participants').getFullList({
            filter: pb.filter('challenge = {:cid}', { cid: challengeId }),
            expand: 'user',
            $autoCancel: false,
          })

          const startsAt = challenge.starts_at
          const endsAt = challenge.ends_at
          const dailyTarget = challenge.daily_target || 0
          const exerciseId = challenge.exercise_id

          return Promise.all(
            participants.map(async (p: any) => {
              const participantUser = p.expand?.user
              const participantName = participantUser?.display_name || participantUser?.email?.split('@')[0] || '?'

              const sessions = await pb.collection('sessions').getFullList({
                filter: pb.filter('user = {:uid} && date >= {:start} && date <= {:end}', { uid: p.user, start: startsAt, end: endsAt }),
                $autoCancel: false,
              })

              const dailyMap = new Map<string, number>()
              for (const session of sessions) {
                try {
                  const sets = await pb.collection('sets_log').getFullList({
                    filter: pb.filter('session = {:sid} && exercise = {:eid}', { sid: (session as any).id, eid: exerciseId }),
                    $autoCancel: false,
                  })
                  const date = (session as any).date
                  const dayTotal = sets.reduce((sum, s: any) => sum + (s.reps || 0), 0)
                  dailyMap.set(date, (dailyMap.get(date) || 0) + dayTotal)
                } catch { /* sin sets para esta sesión/ejercicio */ }
              }

              const dailyProgress: Array<{ date: string; value: number; completed: boolean }> = []
              const start = new Date(startsAt)
              const end = new Date(endsAt)
              let daysCompleted = 0
              let currentStreak = 0
              let streakBroken = false

              for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                const dateStr = toLocalDateStr(d)
                const value = dailyMap.get(dateStr) || 0
                const completed = value >= dailyTarget
                dailyProgress.push({ date: dateStr, value, completed })
                if (completed) {
                  daysCompleted++
                  if (!streakBroken) currentStreak++
                } else {
                  if (dateStr < todayStr()) streakBroken = true
                }
              }

              const totalDays = challenge.duration_days || Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))

              return { participantId: p.user, participantName, daysCompleted, totalDays, currentStreak, dailyProgress }
            }),
          )
        },
      })
    } catch (e: any) {
      console.warn('Get express progress error:', e)
      return []
    } finally {
      setLoading(false)
    }
  }, [qc])

  return { loading, createExpress, getProgress }
}
