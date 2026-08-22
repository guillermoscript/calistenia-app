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
export interface FollowsData {
  following: FollowUser[]
  followers: FollowUser[]
  /** Solicitudes que YO he enviado a cuentas privadas y aún no han aceptado. */
  pendingOutgoing: FollowUser[]
  /** Solicitudes que ME han enviado y aún no he contestado (con id de fila). */
  pendingIncoming: FollowRequest[]
}

/** Una solicitud de seguimiento recibida (cuenta privada, #422). */
export interface FollowRequest {
  /** id de la fila de `follows`: lo que aceptan `/api/follows/{id}/accept|reject`. */
  id: string
  user: FollowUser
  created: string
}

/** Resultado de `follow()`: `requested` cuando el destino es una cuenta privada. */
export type FollowResult = 'following' | 'requested' | false

interface UseFollowsReturn {
  following: FollowUser[]
  followers: FollowUser[]
  followingIds: Set<string>
  followingCount: number
  followersCount: number
  /** Solicitudes pendientes que he enviado (cuentas privadas). */
  pendingOutgoingIds: Set<string>
  /** Solicitudes pendientes recibidas: la bandeja. */
  pendingIncoming: FollowRequest[]
  pendingIncomingCount: number
  loading: boolean
  refreshing: boolean
  /** `'following'` si el seguimiento es inmediato, `'requested'` si quedó pendiente. */
  follow: (targetUserId: string) => Promise<FollowResult>
  /** Deshace un follow aceptado O retira una solicitud pendiente. */
  unfollow: (targetUserId: string) => Promise<boolean>
  isFollowing: (targetUserId: string) => boolean
  /** `true` si hay una solicitud mía pendiente hacia ese usuario. */
  isRequested: (targetUserId: string) => boolean
  acceptRequest: (requestId: string) => Promise<boolean>
  rejectRequest: (requestId: string) => Promise<boolean>
  reload: () => Promise<void>
}

const EMPTY: FollowsData = { following: [], followers: [], pendingOutgoing: [], pendingIncoming: [] }

function toFollowUser(u: any, fallbackId: string): FollowUser {
  return {
    id: u?.id || fallbackId,
    displayName: u?.display_name || u?.name || u?.username || '?',
    username: u?.username || '',
    avatarUrl: u ? getUserAvatarUrl(u, '100x100') : null,
  }
}

/**
 * Una fila sin `status` viene de antes de #422 (o de un hook caído): el backfill
 * de la migración la dio por aceptada, y aquí se trata igual.
 */
const isPendingRow = (r: any) => r?.status === 'pending'

/**
 * Parte las filas de `follows` en las cuatro listas de la caché. Pura y
 * exportada para poder testearla en node: core no renderiza hooks.
 */
export function partitionFollows(followingRes: any[], followersRes: any[]): FollowsData {
  const following: FollowUser[] = []
  const pendingOutgoing: FollowUser[] = []
  for (const r of followingRes) {
    const u = toFollowUser(r.expand?.following, r.following)
    ;(isPendingRow(r) ? pendingOutgoing : following).push(u)
  }

  const followers: FollowUser[] = []
  const pendingIncoming: FollowRequest[] = []
  for (const r of followersRes) {
    const u = toFollowUser(r.expand?.follower, r.follower)
    if (isPendingRow(r)) pendingIncoming.push({ id: r.id, user: u, created: r.created })
    else followers.push(u)
  }

  return { following, followers, pendingOutgoing, pendingIncoming }
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
      if (!available) return EMPTY

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

      return partitionFollows(followingRes as any[], followersRes as any[])
    },
  })

  const following = data?.following ?? EMPTY.following
  const followers = data?.followers ?? EMPTY.followers
  const pendingOutgoing = data?.pendingOutgoing ?? EMPTY.pendingOutgoing
  const pendingIncoming = data?.pendingIncoming ?? EMPTY.pendingIncoming

  const pendingOutgoingIds = useMemo(
    () => new Set(pendingOutgoing.map(u => u.id)),
    [pendingOutgoing],
  )
  const pendingOutgoingIdsRef = useRef(pendingOutgoingIds)
  pendingOutgoingIdsRef.current = pendingOutgoingIds

  // Ref mirror de followingIds — siempre actual, sin closures obsoletos
  const followingIds = useMemo(
    () => new Set(following.map(u => u.id)),
    [following],
  )
  const followingIdsRef = useRef(followingIds)
  followingIdsRef.current = followingIds

  // — Mutación OPTIMISTA: follow —
  const followMutation = useMutation({
    mutationFn: async (targetUserId: string): Promise<FollowResult> => {
      // El status lo fija el servidor (follow_requests.pb.js) según la
      // privacidad del destino; lo que mande el cliente se ignora.
      const rec = await pb.collection('follows').create({
        follower: pb.authStore.record?.id ?? userId,
        following: targetUserId,
      })
      const requested = isPendingRow(rec)
      op.track(requested ? 'follow_requested' : 'user_followed', { target_id: targetUserId })
      return requested ? 'requested' : 'following'
    },
    onMutate: async (targetUserId: string) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<FollowsData>(key) ?? EMPTY
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
      const prev = qc.getQueryData<FollowsData>(key) ?? EMPTY
      qc.setQueryData<FollowsData>(key, {
        ...prev,
        following: prev.following.filter(u => u.id !== targetUserId),
        pendingOutgoing: prev.pendingOutgoing.filter(u => u.id !== targetUserId),
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

  // — Bandeja de solicitudes: aceptar / rechazar van por rutas del servidor —
  // (`follows.updateRule` es null: ningún cliente puede tocar `status`).
  const decideMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'accept' | 'reject' }) => {
      await pb.send(`/api/follows/${id}/${action}`, { method: 'POST' })
      op.track(action === 'accept' ? 'follow_request_accepted' : 'follow_request_rejected')
    },
    onMutate: async ({ id, action }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<FollowsData>(key) ?? EMPTY
      const req = prev.pendingIncoming.find(r => r.id === id)
      qc.setQueryData<FollowsData>(key, {
        ...prev,
        pendingIncoming: prev.pendingIncoming.filter(r => r.id !== id),
        followers: action === 'accept' && req ? [...prev.followers, req.user] : prev.followers,
      })
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
    },
  })

  // — Wrappers públicos que conservan la firma original —
  const follow = useCallback(async (targetUserId: string): Promise<FollowResult> => {
    if (!userId) return false
    if (followingIdsRef.current.has(targetUserId)) return 'following'
    if (pendingOutgoingIdsRef.current.has(targetUserId)) return 'requested'
    if (pendingRef.current.has(targetUserId)) return false
    pendingRef.current.add(targetUserId)
    try {
      return await followMutation.mutateAsync(targetUserId)
    } catch (e: any) {
      console.warn('Follow error:', e?.status, JSON.stringify(e?.response), e?.message)
      return false
    } finally {
      pendingRef.current.delete(targetUserId)
    }
  }, [userId, followMutation])

  const unfollow = useCallback(async (targetUserId: string): Promise<boolean> => {
    if (!userId) return false
    if (!followingIdsRef.current.has(targetUserId) && !pendingOutgoingIdsRef.current.has(targetUserId)) return true
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

  const isRequested = useCallback(
    (targetUserId: string): boolean => pendingOutgoingIds.has(targetUserId),
    [pendingOutgoingIds],
  )

  const acceptRequest = useCallback(async (requestId: string): Promise<boolean> => {
    try {
      await decideMutation.mutateAsync({ id: requestId, action: 'accept' })
      return true
    } catch (e: any) {
      console.warn('Accept follow request error:', e?.status, e?.message)
      return false
    }
  }, [decideMutation])

  const rejectRequest = useCallback(async (requestId: string): Promise<boolean> => {
    try {
      await decideMutation.mutateAsync({ id: requestId, action: 'reject' })
      return true
    } catch (e: any) {
      console.warn('Reject follow request error:', e?.status, e?.message)
      return false
    }
  }, [decideMutation])

  const reload = useCallback(async () => {
    await refetch()
  }, [refetch])

  return {
    following,
    followers,
    followingIds,
    followingCount: following.length,
    followersCount: followers.length,
    pendingOutgoingIds,
    pendingIncoming,
    pendingIncomingCount: pendingIncoming.length,
    // loading = primera carga únicamente; refreshing = refetch de fondo
    loading: isPending,
    refreshing: isFetching && !isPending,
    follow,
    unfollow,
    isFollowing,
    isRequested,
    acceptRequest,
    rejectRequest,
    reload,
  }
}
