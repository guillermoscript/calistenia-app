import { useState, useCallback, useRef } from 'react'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { notifyReaction } from '../lib/notifications'

interface ReactionData {
  count: number
  hasReacted: boolean
}

export function useReactions(userId: string | null) {
  const [reactions, setReactions] = useState<Record<string, ReactionData>>({})
  const loadedRef = useRef(false)

  const loadForSessions = useCallback(async (sessionIds: string[]) => {
    if (!userId || sessionIds.length === 0) return
    const available = await isPocketBaseAvailable()
    if (!available) return

    try {
      // Batch fetch all reactions for these sessions
      const allReactions = await pb.collection('feed_reactions').getFullList({
        filter: sessionIds.map((_, i) => `session_id = {:sid${i}}`).join(' || '),
        ...Object.fromEntries(sessionIds.map((id, i) => [`sid${i}`, id])),
        $autoCancel: false,
      }).catch(() => {
        // Fallback: fetch without filter binding if format fails
        return pb.collection('feed_reactions').getFullList({
          filter: sessionIds.map(id => `session_id = '${id}'`).join(' || '),
          $autoCancel: false,
        })
      }).catch(() => [] as any[])

      const map: Record<string, ReactionData> = {}
      for (const sid of sessionIds) {
        const sessionReactions = allReactions.filter((r: any) => r.session_id === sid)
        map[sid] = {
          count: sessionReactions.length,
          hasReacted: sessionReactions.some((r: any) => r.reactor === userId),
        }
      }
      setReactions(map)
    } catch {
      // Silently fail — reactions are non-critical
    }
  }, [userId])

  const toggleReaction = useCallback(async (sessionId: string) => {
    if (!userId) return
    const available = await isPocketBaseAvailable()
    if (!available) return

    const current = reactions[sessionId]
    const hasReacted = current?.hasReacted || false

    // Optimistic update
    setReactions(prev => ({
      ...prev,
      [sessionId]: {
        count: (prev[sessionId]?.count || 0) + (hasReacted ? -1 : 1),
        hasReacted: !hasReacted,
      },
    }))

    try {
      if (hasReacted) {
        // Remove reaction
        const existing = await pb.collection('feed_reactions').getFirstListItem(
          `session_id = '${sessionId}' && reactor = '${userId}'`,
          { $autoCancel: false },
        )
        await pb.collection('feed_reactions').delete(existing.id)
      } else {
        // Add reaction
        await pb.collection('feed_reactions').create({
          session_id: sessionId,
          reactor: userId,
          emoji: '🔥',
        })
      }
    } catch {
      // Revert optimistic update
      setReactions(prev => ({
        ...prev,
        [sessionId]: {
          count: (prev[sessionId]?.count || 0) + (hasReacted ? 1 : -1),
          hasReacted: hasReacted,
        },
      }))
    }
  }, [userId, reactions])

  const getReaction = useCallback((sessionId: string): ReactionData => {
    return reactions[sessionId] || { count: 0, hasReacted: false }
  }, [reactions])

  return { loadForSessions, toggleReaction, getReaction }
}
