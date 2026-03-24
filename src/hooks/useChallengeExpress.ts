import { useState, useCallback } from 'react'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { todayStr, toLocalDateStr } from '../lib/dateUtils'

export interface ExpressProgress {
  participantId: string
  participantName: string
  daysCompleted: number
  totalDays: number
  currentStreak: number
  dailyProgress: Array<{ date: string; value: number; completed: boolean }>
}

export function useChallengeExpress(userId: string | null) {
  const [loading, setLoading] = useState(false)

  const createExpress = useCallback(async (
    exerciseId: string,
    durationDays: number,
    dailyTarget: number,
    title?: string
  ): Promise<string | null> => {
    if (!userId) return null
    const available = await isPocketBaseAvailable()
    if (!available) return null

    try {
      // Auto-generate title if not provided
      let challengeTitle = title
      if (!challengeTitle) {
        try {
          const exercise = await pb.collection('exercises_catalog').getOne(exerciseId, {
            $autoCancel: false,
          })
          challengeTitle = `Challenge de ${(exercise as any).name} — ${dailyTarget} x ${durationDays}d`
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

      // Add creator as participant
      await pb.collection('challenge_participants').create({
        challenge: challenge.id,
        user: userId,
      }).catch(() => {}) // ignore if duplicate

      return challenge.id
    } catch (e: any) {
      console.warn('Create express challenge error:', e)
      return null
    }
  }, [userId])

  const getProgress = useCallback(async (challengeId: string): Promise<ExpressProgress[]> => {
    const available = await isPocketBaseAvailable()
    if (!available) return []

    setLoading(true)
    try {
      // Get challenge details
      const challenge = await pb.collection('challenges').getOne(challengeId, {
        $autoCancel: false,
      }) as any

      if (challenge.type !== 'express' || !challenge.exercise_id) {
        return []
      }

      // Get participants
      const participants = await pb.collection('challenge_participants').getFullList({
        filter: pb.filter('challenge = {:cid}', { cid: challengeId }),
        expand: 'user',
        $autoCancel: false,
      })

      const startsAt = challenge.starts_at
      const endsAt = challenge.ends_at
      const dailyTarget = challenge.daily_target || 0
      const exerciseId = challenge.exercise_id

      const progressData: ExpressProgress[] = await Promise.all(
        participants.map(async (p: any) => {
          const participantUser = p.expand?.user
          const participantName = participantUser?.display_name || participantUser?.email?.split('@')[0] || '?'

          // Find sessions in the date range for this user
          const sessions = await pb.collection('sessions').getFullList({
            filter: pb.filter(
              'user = {:uid} && date >= {:start} && date <= {:end}',
              { uid: p.user, start: startsAt, end: endsAt }
            ),
            $autoCancel: false,
          })

          // Get sets_log for these sessions that match the exercise
          const sessionIds = sessions.map((s: any) => s.id)
          const dailyMap = new Map<string, number>()

          for (const session of sessions) {
            try {
              const sets = await pb.collection('sets_log').getFullList({
                filter: pb.filter(
                  'session = {:sid} && exercise = {:eid}',
                  { sid: (session as any).id, eid: exerciseId }
                ),
                $autoCancel: false,
              })

              const date = (session as any).date
              const dayTotal = sets.reduce((sum, s: any) => sum + (s.reps || 0), 0)

              dailyMap.set(date, (dailyMap.get(date) || 0) + dayTotal)
            } catch {
              // silent — no sets for this session/exercise combo
            }
          }

          // Build daily progress array
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
              // Only break streak for past days
              const today = todayStr()
              if (dateStr < today) streakBroken = true
            }
          }

          const totalDays = challenge.duration_days || Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))

          return {
            participantId: p.user,
            participantName,
            daysCompleted,
            totalDays,
            currentStreak,
            dailyProgress,
          }
        })
      )

      return progressData
    } catch (e: any) {
      console.warn('Get express progress error:', e)
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    loading,
    createExpress,
    getProgress,
  }
}
