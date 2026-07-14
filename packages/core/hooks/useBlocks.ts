import { useCallback, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pb, isPocketBaseAvailable, getUserAvatarUrl } from '../lib/pocketbase'
import { op } from '../lib/analytics'
import { qk } from '../lib/query-keys'

export interface BlockedUser {
  id: string
  displayName: string
  username: string
  avatarUrl: string | null
  /** id del record de user_blocks — necesario para desbloquear */
  blockRecordId: string
}

interface UseBlocksReturn {
  blocked: BlockedUser[]
  blockedIds: Set<string>
  loading: boolean
  block: (targetUserId: string) => Promise<boolean>
  unblock: (targetUserId: string) => Promise<boolean>
  isBlocked: (targetUserId: string) => boolean
  reload: () => Promise<void>
}

/**
 * Bloqueos del usuario actual. El servidor hace el trabajo pesado al crear el
 * record (unfollow mutuo, campo espejo para reglas, borrado de notifs — ver
 * pb_hooks/user_blocks.pb.js); este hook solo gestiona el record y revienta
 * los cachés sociales para que el contenido (des)aparezca al instante.
 */
export function useBlocks(userId: string | null): UseBlocksReturn {
  const qc = useQueryClient()
  const key = qk.blocks(userId)
  const pendingRef = useRef<Set<string>>(new Set())

  const { data, isPending, refetch } = useQuery<BlockedUser[]>({
    queryKey: key,
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async () => {
      const available = await isPocketBaseAvailable()
      if (!available) return []
      const recs = await pb.collection('user_blocks').getFullList({
        filter: pb.filter('blocker = {:uid}', { uid: userId! }),
        expand: 'blocked',
        $autoCancel: false,
      })
      return recs.map((r: any) => {
        const u = r.expand?.blocked
        return {
          id: u?.id || r.blocked,
          displayName: u?.display_name || u?.name || u?.username || '?',
          username: u?.username || '',
          avatarUrl: u ? getUserAvatarUrl(u, '100x100') : null,
          blockRecordId: r.id,
        }
      })
    },
  })

  const blocked = data ?? []
  const blockedIds = useMemo(() => new Set(blocked.map(u => u.id)), [blocked])
  const blockedIdsRef = useRef(blockedIds)
  blockedIdsRef.current = blockedIds

  // El servidor borra follows y filtra lecturas — invalidar todo lo social
  // para que la UI refleje el cambio sin recargar.
  const invalidateSocial = useCallback(() => {
    qc.invalidateQueries({ queryKey: key })
    qc.invalidateQueries({ queryKey: qk.follows(userId) })
    qc.invalidateQueries({ queryKey: qk.feed.all })
    qc.invalidateQueries({ queryKey: qk.comments.all })
    qc.invalidateQueries({ queryKey: ['comment-reactions'] })
    qc.invalidateQueries({ queryKey: ['reactions'] })
    qc.invalidateQueries({ queryKey: qk.notifications.all })
    qc.invalidateQueries({ queryKey: ['leaderboard'] })
    qc.invalidateQueries({ queryKey: ['challenges'] })
    qc.invalidateQueries({ queryKey: ['challenge-leaderboard'] })
  }, [qc, key, userId])

  const blockMutation = useMutation({
    mutationFn: async (targetUserId: string) => {
      await pb.collection('user_blocks').create({
        blocker: pb.authStore.record?.id ?? userId,
        blocked: targetUserId,
      })
      op.track('user_blocked', { target_id: targetUserId })
    },
    onSettled: invalidateSocial,
  })

  const unblockMutation = useMutation({
    mutationFn: async (targetUserId: string) => {
      const rec = blocked.find(u => u.id === targetUserId)
      const recordId = rec?.blockRecordId ?? (await pb.collection('user_blocks').getFirstListItem(
        pb.filter('blocker = {:me} && blocked = {:them}', { me: userId, them: targetUserId }),
        { $autoCancel: false },
      )).id
      await pb.collection('user_blocks').delete(recordId)
      op.track('user_unblocked', { target_id: targetUserId })
    },
    onSettled: invalidateSocial,
  })

  const block = useCallback(async (targetUserId: string): Promise<boolean> => {
    if (!userId || targetUserId === userId) return false
    if (blockedIdsRef.current.has(targetUserId)) return true
    if (pendingRef.current.has(targetUserId)) return false
    pendingRef.current.add(targetUserId)
    try {
      await blockMutation.mutateAsync(targetUserId)
      return true
    } catch (e: any) {
      // 400 por índice único = ya estaba bloqueado → idempotente
      if (e?.status === 400) return true
      console.warn('Block error:', e?.status, e?.message)
      return false
    } finally {
      pendingRef.current.delete(targetUserId)
    }
  }, [userId, blockMutation])

  const unblock = useCallback(async (targetUserId: string): Promise<boolean> => {
    if (!userId) return false
    if (!blockedIdsRef.current.has(targetUserId)) return true
    if (pendingRef.current.has(targetUserId)) return false
    pendingRef.current.add(targetUserId)
    try {
      await unblockMutation.mutateAsync(targetUserId)
      return true
    } catch (e: any) {
      console.warn('Unblock error:', e?.status, e?.message)
      return false
    } finally {
      pendingRef.current.delete(targetUserId)
    }
  }, [userId, unblockMutation])

  const isBlocked = useCallback(
    (targetUserId: string): boolean => blockedIds.has(targetUserId),
    [blockedIds],
  )

  const reload = useCallback(async () => { await refetch() }, [refetch])

  return {
    blocked,
    blockedIds,
    loading: isPending,
    block,
    unblock,
    isBlocked,
    reload,
  }
}
