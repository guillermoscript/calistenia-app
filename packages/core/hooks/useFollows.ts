import { useCallback, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pb, isPocketBaseAvailable, getUserAvatarUrl } from '../lib/pocketbase'
import { op } from '../lib/analytics'
import { qk } from '../lib/query-keys'

export interface FollowUser {
  id: string
  displayName: string
  username: string
  avatarUrl: string | null
}

/** Forma del caché para esta query: ambas listas en un solo objeto. */
interface FollowsData {
  following: FollowUser[]
  followers: FollowUser[]
}

interface UseFollowsReturn {
  following: FollowUser[]
  followers: FollowUser[]
  followingIds: Set<string>
  followingCount: number
  followersCount: number
  loading: boolean
  refreshing: boolean
  follow: (targetUserId: string) => Promise<boolean>
  unfollow: (targetUserId: string) => Promise<boolean>
  isFollowing: (targetUserId: string) => boolean
  reload: () => Promise<void>
}

/**
 * Follows del usuario: seguidores + seguidos en una única query TanStack.
 * Las mutaciones follow/unfollow son OPTIMISTAS — onMutate actualiza el caché,
 * onError restaura el snapshot anterior.
 * Forma pública estable: { following, followers, followingIds, follow, unfollow, … }.
 */
export function useFollows(userId: string | null): UseFollowsReturn {
  const qc = useQueryClient()
  const key = qk.follows(userId)

  // Track in-flight actions to prevent double-clicks (se conserva del original)
  const pendingRef = useRef<Set<string>>(new Set())

  // — Query principal: colapsa los 2 reads en uno —
  const { data, isFetching, isPending, refetch } = useQuery<FollowsData>({
    queryKey: key,
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async () => {
      const available = await isPocketBaseAvailable()
      if (!available) return { following: [], followers: [] }

      const [followingRes, followersRes] = await Promise.all([
        pb.collection('follows').getFullList({
          filter: pb.filter('follower = {:uid}', { uid: userId! }),
          expand: 'following',
          $autoCancel: false,
        }),
        pb.collection('follows').getFullList({
          filter: pb.filter('following = {:uid}', { uid: userId! }),
          expand: 'follower',
          $autoCancel: false,
        }),
      ])

      const followingUsers: FollowUser[] = followingRes.map((r: any) => {
        const u = r.expand?.following
        return {
          id: u?.id || r.following,
          displayName: u?.display_name || u?.name || u?.username || '?',
          username: u?.username || '',
          avatarUrl: u ? getUserAvatarUrl(u, '100x100') : null,
        }
      })

      const followerUsers: FollowUser[] = followersRes.map((r: any) => {
        const u = r.expand?.follower
        return {
          id: u?.id || r.follower,
          displayName: u?.display_name || u?.name || u?.username || '?',
          username: u?.username || '',
          avatarUrl: u ? getUserAvatarUrl(u, '100x100') : null,
        }
      })

      return { following: followingUsers, followers: followerUsers }
    },
  })

  const following = data?.following ?? []
  const followers = data?.followers ?? []

  // Ref mirror de followingIds — siempre actual, sin closures obsoletos
  const followingIds = useMemo(
    () => new Set(following.map(u => u.id)),
    [following],
  )
  const followingIdsRef = useRef(followingIds)
  followingIdsRef.current = followingIds

  // — Mutación OPTIMISTA: follow —
  const followMutation = useMutation({
    mutationFn: async (targetUserId: string) => {
      await pb.collection('follows').create({
        follower: pb.authStore.record?.id ?? userId,
        following: targetUserId,
      })
      op.track('user_followed', { target_id: targetUserId })
    },
    onMutate: async (targetUserId: string) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<FollowsData>(key) ?? { following: [], followers: [] }
      // Usuario optimista mínimo — la query real traerá el perfil completo
      const optimisticUser: FollowUser = {
        id: targetUserId,
        displayName: '?',
        username: '',
        avatarUrl: null,
      }
      qc.setQueryData<FollowsData>(key, {
        ...prev,
        following: [...prev.following, optimisticUser],
      })
      return { prev }
    },
    onError: (_err, _targetUserId, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
    },
  })

  // — Mutación OPTIMISTA: unfollow —
  const unfollowMutation = useMutation({
    mutationFn: async (targetUserId: string) => {
      const record = await pb.collection('follows').getFirstListItem(
        pb.filter('follower = {:me} && following = {:them}', { me: userId, them: targetUserId }),
        { $autoCancel: false },
      )
      await pb.collection('follows').delete(record.id)
    },
    onMutate: async (targetUserId: string) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<FollowsData>(key) ?? { following: [], followers: [] }
      qc.setQueryData<FollowsData>(key, {
        ...prev,
        following: prev.following.filter(u => u.id !== targetUserId),
      })
      return { prev }
    },
    onError: (_err, _targetUserId, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
    },
  })

  // — Wrappers públicos que conservan la firma original (Promise<boolean>) —
  const follow = useCallback(async (targetUserId: string): Promise<boolean> => {
    if (!userId) return false
    if (followingIdsRef.current.has(targetUserId)) return true
    if (pendingRef.current.has(targetUserId)) return false
    pendingRef.current.add(targetUserId)
    try {
      await followMutation.mutateAsync(targetUserId)
      return true
    } catch (e: any) {
      console.warn('Follow error:', e?.status, JSON.stringify(e?.response), e?.message)
      return false
    } finally {
      pendingRef.current.delete(targetUserId)
    }
  }, [userId, followMutation])

  const unfollow = useCallback(async (targetUserId: string): Promise<boolean> => {
    if (!userId) return false
    if (!followingIdsRef.current.has(targetUserId)) return true
    if (pendingRef.current.has(targetUserId)) return false
    pendingRef.current.add(targetUserId)
    try {
      await unfollowMutation.mutateAsync(targetUserId)
      return true
    } catch (e: any) {
      console.warn('Unfollow error:', e)
      return false
    } finally {
      pendingRef.current.delete(targetUserId)
    }
  }, [userId, unfollowMutation])

  const isFollowing = useCallback(
    (targetUserId: string): boolean => followingIds.has(targetUserId),
    [followingIds],
  )

  const reload = useCallback(async () => {
    await refetch()
  }, [refetch])

  return {
    following,
    followers,
    followingIds,
    followingCount: following.length,
    followersCount: followers.length,
    // loading = primera carga únicamente; refreshing = refetch de fondo
    loading: isPending,
    refreshing: isFetching && !isPending,
    follow,
    unfollow,
    isFollowing,
    reload,
  }
}
