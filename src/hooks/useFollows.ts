import { useState, useCallback, useRef, useEffect } from 'react'
import { pb, isPocketBaseAvailable, getUserAvatarUrl } from '../lib/pocketbase'

export interface FollowUser {
  id: string
  displayName: string
  username: string
  avatarUrl: string | null
}

interface UseFollowsReturn {
  following: FollowUser[]
  followers: FollowUser[]
  followingIds: Set<string>
  followingCount: number
  followersCount: number
  loading: boolean
  follow: (targetUserId: string) => Promise<boolean>
  unfollow: (targetUserId: string) => Promise<boolean>
  isFollowing: (targetUserId: string) => boolean
  reload: () => Promise<void>
}

export function useFollows(userId: string | null): UseFollowsReturn {
  const [following, setFollowing] = useState<FollowUser[]>([])
  const [followers, setFollowers] = useState<FollowUser[]>([])
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const initialized = useRef(false)

  const load = useCallback(async () => {
    if (!userId) return
    const available = await isPocketBaseAvailable()
    if (!available) return

    setLoading(true)
    try {
      const [followingRes, followersRes] = await Promise.all([
        pb.collection('follows').getFullList({
          filter: pb.filter('follower = {:uid}', { uid: userId }),
          expand: 'following',
          $autoCancel: false,
        }),
        pb.collection('follows').getFullList({
          filter: pb.filter('following = {:uid}', { uid: userId }),
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

      setFollowing(followingUsers)
      setFollowers(followerUsers)
      setFollowingIds(new Set(followingUsers.map(u => u.id)))
    } catch (e) {
      console.warn('Failed to load follows:', e)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    if (!initialized.current && userId) {
      initialized.current = true
      load()
    }
  }, [userId, load])

  const follow = useCallback(async (targetUserId: string): Promise<boolean> => {
    if (!userId) return false
    // Optimistic update — instant UI feedback
    setFollowingIds(prev => new Set([...prev, targetUserId]))
    try {
      await pb.collection('follows').create({
        follower: userId,
        following: targetUserId,
      })
      load() // Reload full data in background
      return true
    } catch (e: any) {
      // Revert optimistic update
      setFollowingIds(prev => {
        const next = new Set(prev)
        next.delete(targetUserId)
        return next
      })
      console.warn('Follow error:', e?.status, e?.response?.data, e?.response?.message, e)
      return false
    }
  }, [userId, load])

  const unfollow = useCallback(async (targetUserId: string): Promise<boolean> => {
    if (!userId) return false
    // Optimistic update — instant UI feedback
    setFollowingIds(prev => {
      const next = new Set(prev)
      next.delete(targetUserId)
      return next
    })
    try {
      const record = await pb.collection('follows').getFirstListItem(
        pb.filter('follower = {:me} && following = {:them}', { me: userId, them: targetUserId }),
        { $autoCancel: false },
      )
      await pb.collection('follows').delete(record.id)
      load() // Reload full data in background
      return true
    } catch (e) {
      // Revert optimistic update
      setFollowingIds(prev => new Set([...prev, targetUserId]))
      console.warn('Unfollow error:', e)
      return false
    }
  }, [userId, load])

  const isFollowing = useCallback((targetUserId: string): boolean => {
    return followingIds.has(targetUserId)
  }, [followingIds])

  return {
    following,
    followers,
    followingIds,
    followingCount: following.length,
    followersCount: followers.length,
    loading,
    follow,
    unfollow,
    isFollowing,
    reload: load,
  }
}
