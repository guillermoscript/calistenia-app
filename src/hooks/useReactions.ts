import { useState, useCallback, useRef } from 'react'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { notifyReaction } from '../lib/notifications'

export const REACTION_EMOJIS = ['🔥', '💪', '👏', '🎯', '🏆'] as const

export type EmojiReactions = Record<string, { count: number; hasReacted: boolean }>
type ReactionsMap = Record<string, EmojiReactions>

export function useReactions(userId: string | null) {
  const [reactions, setReactions] = useState<ReactionsMap>({})
  const loadedRef = useRef(false)

  const loadForSessions = useCallback(async (sessionIds: string[]) => {
    if (!userId || sessionIds.length === 0) return
    const available = await isPocketBaseAvailable()
    if (!available) return

    try {
      const allReactions = await pb.collection('feed_reactions').getFullList({
        filter: sessionIds.map((_, i) => `session_id = {:sid${i}}`).join(' || '),
        ...Object.fromEntries(sessionIds.map((id, i) => [`sid${i}`, id])),
        $autoCancel: false,
      }).catch(() => {
        return pb.collection('feed_reactions').getFullList({
          filter: sessionIds.map(id => `session_id = '${id}'`).join(' || '),
          $autoCancel: false,
        })
      }).catch(() => [] as any[])

      const map: ReactionsMap = {}
      for (const sid of sessionIds) {
        const sessionReactions = allReactions.filter((r: any) => r.session_id === sid)
        const emojiMap: EmojiReactions = {}

        for (const emoji of REACTION_EMOJIS) {
          const emojiReactions = sessionReactions.filter((r: any) => r.emoji === emoji)
          emojiMap[emoji] = {
            count: emojiReactions.length,
            hasReacted: emojiReactions.some((r: any) => r.reactor === userId),
          }
        }

        // Also pick up any non-standard emojis that might exist in the data
        for (const r of sessionReactions) {
          if (!emojiMap[r.emoji]) {
            const emojiReactions = sessionReactions.filter((rx: any) => rx.emoji === r.emoji)
            emojiMap[r.emoji] = {
              count: emojiReactions.length,
              hasReacted: emojiReactions.some((rx: any) => rx.reactor === userId),
            }
          }
        }

        map[sid] = emojiMap
      }
      setReactions(map)
      loadedRef.current = true
    } catch {
      // Silently fail — reactions are non-critical
    }
  }, [userId])

  const toggleReaction = useCallback(async (sessionId: string, emoji: string) => {
    if (!userId) return
    const available = await isPocketBaseAvailable()
    if (!available) return

    const current = reactions[sessionId]?.[emoji]
    const hasReacted = current?.hasReacted || false

    // Optimistic update
    setReactions(prev => ({
      ...prev,
      [sessionId]: {
        ...prev[sessionId],
        [emoji]: {
          count: (prev[sessionId]?.[emoji]?.count || 0) + (hasReacted ? -1 : 1),
          hasReacted: !hasReacted,
        },
      },
    }))

    try {
      if (hasReacted) {
        const existing = await pb.collection('feed_reactions').getFirstListItem(
          `session_id = '${sessionId}' && reactor = '${userId}' && emoji = '${emoji}'`,
          { $autoCancel: false },
        )
        await pb.collection('feed_reactions').delete(existing.id)
      } else {
        await pb.collection('feed_reactions').create({
          session_id: sessionId,
          reactor: userId,
          emoji,
        })
      }
    } catch {
      // Revert optimistic update
      setReactions(prev => ({
        ...prev,
        [sessionId]: {
          ...prev[sessionId],
          [emoji]: {
            count: (prev[sessionId]?.[emoji]?.count || 0) + (hasReacted ? 1 : -1),
            hasReacted: hasReacted,
          },
        },
      }))
    }
  }, [userId, reactions])

  const getReactions = useCallback((sessionId: string): EmojiReactions => {
    return reactions[sessionId] || {}
  }, [reactions])

  return { loadForSessions, toggleReaction, getReactions, REACTION_EMOJIS }
}
