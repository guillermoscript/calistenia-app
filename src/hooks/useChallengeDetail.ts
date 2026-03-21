import { useState, useCallback } from 'react'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import type { Challenge, ChallengeMetric } from '../types'
import type { LeaderboardEntry } from './useLeaderboard'

export function useChallengeDetail(challengeId: string | null, currentUserId: string | null) {
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [participantIds, setParticipantIds] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    if (!challengeId || !currentUserId) return
    const available = await isPocketBaseAvailable()
    if (!available) return

    setLoading(true)
    try {
      // 1. Fetch challenge
      const ch = await pb.collection('challenges').getOne(challengeId, { $autoCancel: false })
      const challengeData: Challenge = {
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
      setChallenge(challengeData)

      // 2. Fetch participants with expanded user
      const participants = await pb.collection('challenge_participants').getFullList({
        filter: pb.filter('challenge = {:cid}', { cid: challengeId }),
        expand: 'user',
        $autoCancel: false,
      })

      const pIds = new Set(participants.map((p: any) => p.user as string))
      setParticipantIds(pIds)

      // 3. Calculate scores per participant
      const startStr = challengeData.starts_at + ' 00:00:00'
      const endStr = challengeData.ends_at + ' 23:59:59'

      const entries = await Promise.all(
        participants.map(async (p: any) => {
          const user = p.expand?.user
          const uid = p.user as string
          const displayName = user?.display_name || user?.email?.split('@')[0] || '?'

          let value = 0
          try {
            value = await getScore(uid, challengeData.metric, startStr, endStr)
          } catch { /* default 0 */ }

          return {
            userId: uid,
            displayName,
            value,
            isCurrentUser: uid === currentUserId,
          }
        })
      )

      setLeaderboard(entries.sort((a, b) => b.value - a.value))
    } catch (e: any) {
      if (e?.status !== 404 && e?.status !== 0) {
        console.warn('Challenge detail load error:', e)
      }
    } finally {
      setLoading(false)
    }
  }, [challengeId, currentUserId])

  const inviteUser = useCallback(async (targetUserId: string): Promise<boolean> => {
    if (!challengeId) return false
    try {
      await pb.collection('challenge_participants').create({
        challenge: challengeId,
        user: targetUserId,
      })
      await load()
      return true
    } catch {
      return false
    }
  }, [challengeId, load])

  return { challenge, leaderboard, loading, participantIds, load, inviteUser }
}

// ── Score calculation ────────────────────────────────────────────────────────

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
      const dates = [...new Set(sessions.map((s: any) => (s.completed_at?.split(' ')[0] || '')))]
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
