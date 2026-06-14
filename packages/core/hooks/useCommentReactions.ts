import { useState, useCallback, useRef } from 'react'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'

const REACTIONS_TTL = 30_000

export const COMMENT_REACTION_EMOJIS = ['🔥', '💪', '👏', '❤️'] as const

export type CommentEmojiReactions = Record<string, { count: number; hasReacted: boolean }>
type ReactionsMap = Record<string, CommentEmojiReactions>

export function useCommentReactions(userId: string | null) {
  const [reactions, setReactions] = useState<ReactionsMap>({})
  // Dedup: ids con fetch en vuelo y timestamp del último fetch por id.
  // Evita la tormenta de requests repetidas al mismo comment_id en cada render.
  const inFlight = useRef<Set<string>>(new Set())
  const fetchedAt = useRef<Map<string, number>>(new Map())

  const loadForComments = useCallback(async (commentIds: string[]) => {
    if (!userId || commentIds.length === 0) return

    // Solo pedir ids que no estén en vuelo ni cacheados dentro del TTL.
    const now = Date.now()
    const toFetch = commentIds.filter(id => {
      if (inFlight.current.has(id)) return false
      const at = fetchedAt.current.get(id)
      return !(at && now - at < REACTIONS_TTL)
    })
    if (toFetch.length === 0) return

    const available = await isPocketBaseAvailable()
    if (!available) return

    toFetch.forEach(id => inFlight.current.add(id))
    try {
      const allReactions = await pb.collection('comment_reactions').getFullList({
        filter: pb.filter(
          toFetch.map((_, i) => `comment_id = {:cid${i}}`).join(' || '),
          Object.fromEntries(toFetch.map((id, i) => [`cid${i}`, id])),
        ),
        $autoCancel: false,
      }).catch(() => [] as any[])

      const map: ReactionsMap = {}
      for (const cid of toFetch) {
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
      const doneAt = Date.now()
      toFetch.forEach(id => fetchedAt.current.set(id, doneAt))
    } catch {
      // non-critical
    } finally {
      toFetch.forEach(id => inFlight.current.delete(id))
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
