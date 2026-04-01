import { useState, useCallback } from 'react'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'

export const COMMENT_REACTION_EMOJIS = ['🔥', '💪', '👏', '❤️'] as const

export type CommentEmojiReactions = Record<string, { count: number; hasReacted: boolean }>
type ReactionsMap = Record<string, CommentEmojiReactions>

export function useCommentReactions(userId: string | null) {
  const [reactions, setReactions] = useState<ReactionsMap>({})

  const loadForComments = useCallback(async (commentIds: string[]) => {
    if (!userId || commentIds.length === 0) return
    const available = await isPocketBaseAvailable()
    if (!available) return

    try {
      const allReactions = await pb.collection('comment_reactions').getFullList({
        filter: commentIds.map(id => `comment_id = '${id}'`).join(' || '),
        $autoCancel: false,
      }).catch(() => [] as any[])

      const map: ReactionsMap = {}
      for (const cid of commentIds) {
        const commentReactions = allReactions.filter((r: any) => r.comment_id === cid)
        const emojiMap: CommentEmojiReactions = {}

        for (const emoji of COMMENT_REACTION_EMOJIS) {
          const emojiReactions = commentReactions.filter((r: any) => r.emoji === emoji)
          emojiMap[emoji] = {
            count: emojiReactions.length,
            hasReacted: emojiReactions.some((r: any) => r.reactor === userId),
          }
        }

        // Pick up any non-standard emojis
        for (const r of commentReactions) {
          if (!emojiMap[r.emoji]) {
            const emojiReactions = commentReactions.filter((rx: any) => rx.emoji === r.emoji)
            emojiMap[r.emoji] = {
              count: emojiReactions.length,
              hasReacted: emojiReactions.some((rx: any) => rx.reactor === userId),
            }
          }
        }

        map[cid] = emojiMap
      }
      setReactions(prev => ({ ...prev, ...map }))
    } catch {
      // non-critical
    }
  }, [userId])

  const toggleReaction = useCallback(async (commentId: string, emoji: string) => {
    if (!userId) return
    const available = await isPocketBaseAvailable()
    if (!available) return

    const current = reactions[commentId]?.[emoji]
    const hasReacted = current?.hasReacted || false

    // Optimistic update
    setReactions(prev => ({
      ...prev,
      [commentId]: {
        ...prev[commentId],
        [emoji]: {
          count: (prev[commentId]?.[emoji]?.count || 0) + (hasReacted ? -1 : 1),
          hasReacted: !hasReacted,
        },
      },
    }))

    try {
      if (hasReacted) {
        const existing = await pb.collection('comment_reactions').getFirstListItem(
          `comment_id = '${commentId}' && reactor = '${userId}' && emoji = '${emoji}'`,
          { $autoCancel: false },
        )
        await pb.collection('comment_reactions').delete(existing.id)
      } else {
        await pb.collection('comment_reactions').create({
          comment_id: commentId,
          reactor: userId,
          emoji,
        })
      }
    } catch {
      // Revert optimistic update
      setReactions(prev => ({
        ...prev,
        [commentId]: {
          ...prev[commentId],
          [emoji]: {
            count: (prev[commentId]?.[emoji]?.count || 0) + (hasReacted ? 1 : -1),
            hasReacted,
          },
        },
      }))
    }
  }, [userId, reactions])

  const getReactions = useCallback((commentId: string): CommentEmojiReactions => {
    return reactions[commentId] || {}
  }, [reactions])

  return { loadForComments, toggleReaction, getReactions }
}
