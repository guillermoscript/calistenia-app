import { useState, useCallback, useRef } from 'react'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'

export interface Comment {
  id: string
  sessionId: string
  authorId: string
  authorName: string
  text: string
  parentId: string | null
  created: string
  replies: Comment[]
}

const CACHE_TTL = 30_000

export function useComments(userId: string | null) {
  const [commentsBySession, setCommentsBySession] = useState<Record<string, Comment[]>>({})
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({})
  const cacheTimestamps = useRef<Record<string, number>>({})
  const lastCommentTime = useRef<number>(0)

  const getComments = useCallback(async (sessionId: string): Promise<Comment[]> => {
    if (!userId) return []
    const available = await isPocketBaseAvailable()
    if (!available) return []

    // Check cache
    const cached = cacheTimestamps.current[sessionId]
    if (cached && Date.now() - cached < CACHE_TTL && commentsBySession[sessionId]) {
      return commentsBySession[sessionId]
    }

    try {
      const records = await pb.collection('comments').getFullList({
        filter: `session_id = '${sessionId}'`,
        sort: 'created',
        expand: 'author',
        $autoCancel: false,
      })

      // Build flat list
      const flat: Comment[] = records.map((r: any) => ({
        id: r.id,
        sessionId: r.session_id,
        authorId: r.author,
        authorName: r.expand?.author?.display_name || r.expand?.author?.email?.split('@')[0] || '?',
        text: r.text,
        parentId: r.parent_id || null,
        created: r.created,
        replies: [],
      }))

      // Thread: group replies under parents (1 level max)
      const topLevel: Comment[] = []
      const replyMap = new Map<string, Comment[]>()

      for (const c of flat) {
        if (c.parentId) {
          if (!replyMap.has(c.parentId)) replyMap.set(c.parentId, [])
          replyMap.get(c.parentId)!.push(c)
        } else {
          topLevel.push(c)
        }
      }

      for (const c of topLevel) {
        c.replies = replyMap.get(c.id) || []
      }

      setCommentsBySession(prev => ({ ...prev, [sessionId]: topLevel }))
      cacheTimestamps.current[sessionId] = Date.now()
      return topLevel
    } catch {
      return []
    }
  }, [userId, commentsBySession])

  const loadCommentCounts = useCallback(async (sessionIds: string[]) => {
    if (!userId || sessionIds.length === 0) return
    const available = await isPocketBaseAvailable()
    if (!available) return

    try {
      const allComments = await pb.collection('comments').getFullList({
        filter: sessionIds.map(id => `session_id = '${id}'`).join(' || '),
        fields: 'session_id',
        $autoCancel: false,
      })

      const counts: Record<string, number> = {}
      for (const id of sessionIds) counts[id] = 0
      for (const r of allComments) {
        const sid = (r as any).session_id
        counts[sid] = (counts[sid] || 0) + 1
      }
      setCommentCounts(counts)
    } catch { /* silent */ }
  }, [userId])

  const addComment = useCallback(async (sessionId: string, text: string, parentId?: string): Promise<boolean> => {
    if (!userId) return false

    // Rate limit: 5 seconds between comments
    const now = Date.now()
    if (now - lastCommentTime.current < 5000) return false
    lastCommentTime.current = now

    const available = await isPocketBaseAvailable()
    if (!available) return false

    try {
      await pb.collection('comments').create({
        session_id: sessionId,
        author: userId,
        text: text.trim(),
        parent_id: parentId || null,
      })

      // Invalidate cache for this session
      delete cacheTimestamps.current[sessionId]
      // Update count
      setCommentCounts(prev => ({ ...prev, [sessionId]: (prev[sessionId] || 0) + 1 }))
      // Reload comments
      await getComments(sessionId)
      return true
    } catch {
      return false
    }
  }, [userId, getComments])

  const deleteComment = useCallback(async (commentId: string, sessionId: string): Promise<boolean> => {
    if (!userId) return false
    const available = await isPocketBaseAvailable()
    if (!available) return false

    try {
      await pb.collection('comments').delete(commentId)
      delete cacheTimestamps.current[sessionId]
      setCommentCounts(prev => ({ ...prev, [sessionId]: Math.max(0, (prev[sessionId] || 0) - 1) }))
      await getComments(sessionId)
      return true
    } catch {
      return false
    }
  }, [userId, getComments])

  const getCommentCount = useCallback((sessionId: string): number => {
    return commentCounts[sessionId] || 0
  }, [commentCounts])

  return { getComments, loadCommentCounts, addComment, deleteComment, getCommentCount, commentsBySession }
}
