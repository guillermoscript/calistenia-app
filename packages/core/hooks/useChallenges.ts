import { useState, useCallback } from 'react'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { op } from '../lib/analytics'
import { todayStr } from '../lib/dateUtils'
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

export function useChallenges(userId: string | null) {
  const [active, setActive] = useState<ChallengeWithMeta[]>([])
  const [past, setPast] = useState<ChallengeWithMeta[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!userId) return
    const available = await isPocketBaseAvailable()
    if (!available) return

    setLoading(true)
    try {
      // Fetch all challenge_participants for this user, expand challenge
      const participations = await pb.collection('challenge_participants').getFullList({
        filter: pb.filter('user = {:uid}', { uid: userId }),
        expand: 'challenge',
        $autoCancel: false,
      })

      const today = todayStr()
      const challengeMap = new Map<string, ChallengeWithMeta>()

      for (const p of participations) {
        const c = (p as any).expand?.challenge
        if (!c) continue

        // Auto-end expired challenges
        if (c.status === 'active' && c.ends_at < today) {
          try {
            await pb.collection('challenges').update(c.id, { status: 'ended' })
            c.status = 'ended'
            op.track('challenge_completed', { challenge_id: c.id })
          } catch { /* creator-only, ignore if not creator */ }
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

      // Count participants per challenge
      const countPromises = Array.from(challengeMap.keys()).map(async (cid) => {
        try {
          const res = await pb.collection('challenge_participants').getList(1, 1, {
            filter: pb.filter('challenge = {:cid}', { cid }),
            $autoCancel: false,
          })
          const ch = challengeMap.get(cid)!
          ch.participantCount = res.totalItems
        } catch { /* ignore */ }
      })
      await Promise.all(countPromises)

      const all = Array.from(challengeMap.values())
      setActive(all.filter(c => c.status === 'active').sort((a, b) => a.ends_at.localeCompare(b.ends_at)))
      setPast(all.filter(c => c.status === 'ended').sort((a, b) => b.ends_at.localeCompare(a.ends_at)))
    } catch (e: any) {
      if (e?.status !== 404 && e?.status !== 0) {
        console.warn('Challenges load error:', e)
      }
    } finally {
      setLoading(false)
    }
  }, [userId])

  const createChallenge = useCallback(async (data: CreateChallengeData): Promise<string | null> => {
    if (!userId) return null
    try {
      const challenge = await pb.collection('challenges').create({
        creator: userId,
        title: data.title,
        metric: data.metric,
        custom_metric: data.custom_metric || '',
        description: data.description || '',
        goal: data.goal || 0,
        starts_at: data.starts_at,
        ends_at: data.ends_at,
        status: 'active',
      })

      // Add creator + invited users as participants
      const allParticipants = [userId, ...data.invitedUserIds]
      await Promise.all(
        allParticipants.map(uid =>
          pb.collection('challenge_participants').create({
            challenge: challenge.id,
            user: uid,
          }).catch(() => {}) // ignore duplicates
        )
      )

      op.track('challenge_created', { metric: data.metric, duration_days: Math.ceil((new Date(data.ends_at).getTime() - new Date(data.starts_at).getTime()) / 86400000), participant_count: allParticipants.length })
      await load()
      return challenge.id
    } catch (e) {
      console.warn('Create challenge error:', e)
      return null
    }
  }, [userId, load])

  return { active, past, loading, load, createChallenge }
}
