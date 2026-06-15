import { useState, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'

export type NotificationType = 'follow' | 'reaction' | 'comment' | 'comment_reply' | 'challenge_invite' | 'challenge_join' | 'challenge_complete' | 'achievement' | 'streak' | 'referral_signup' | 'referral_bonus'

export interface AppNotification {
  id: string
  userId: string
  type: NotificationType
  actorId: string
  actorName: string
  referenceId: string
  referenceType: string
  read: boolean
  data?: Record<string, any>
  created: string
}

function mapNotification(r: any): AppNotification {
  return {
    id: r.id,
    userId: r.user,
    type: r.type as NotificationType,
    actorId: r.actor,
    actorName: r.expand?.actor?.display_name || r.expand?.actor?.email?.split('@')[0] || '?',
    referenceId: r.reference_id,
    referenceType: r.reference_type,
    read: r.read || false,
    data: r.data || {},
    created: r.created,
  }
}

/**
 * Notificaciones con badge en vivo. Migrado a TanStack Query conservando la
 * forma pública: { notifications, unreadCount, loading, loadNotifications,
 * refreshUnreadCount, markAsRead, markAllAsRead }.
 *
 * - La lista es lazy: solo se carga al llamar `loadNotifications` (igual que
 *   antes, cuando se abre el panel). Internamente se activa con un estado de
 *   límite que habilita la query.
 * - El contador de no leídas es una query ligera con staleTime 60s.
 * - La suscripción realtime hace de puente: en cada notificación nueva del
 *   usuario invalida el contador (RQ refetch), sin estado manual.
 */
export function useNotifications(userId: string | null) {
  const qc = useQueryClient()
  // null = la lista aún no se ha solicitado (panel cerrado) → query deshabilitada.
  const [limit, setLimit] = useState<number | null>(null)

  const listQuery = useQuery({
    queryKey: qk.notifications.list(userId, limit ?? 50),
    enabled: !!userId && limit != null,
    queryFn: async (): Promise<AppNotification[]> => {
      const res = await pb.collection('notifications').getList(1, limit ?? 50, {
        filter: pb.filter('user = {:uid}', { uid: userId! }),
        sort: '-created',
        expand: 'actor',
        $autoCancel: false,
      })
      return res.items.map(mapNotification)
    },
  })

  const countQuery = useQuery({
    queryKey: qk.notifications.unreadCount(userId),
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<number> => {
      const res = await pb.collection('notifications').getList(1, 1, {
        filter: pb.filter('user = {:uid} && read = false', { uid: userId! }),
        $autoCancel: false,
      })
      return res.totalItems
    },
  })

  const notifications = listQuery.data ?? []
  const unreadCount = countQuery.data ?? 0

  const loadNotifications = useCallback(async (l = 50) => {
    if (!userId) return
    setLimit((prev) => {
      // Mismo límite ya activo → forzamos refetch para igualar el comportamiento previo.
      if (prev === l) {
        qc.invalidateQueries({ queryKey: qk.notifications.list(userId, l) })
      }
      return l
    })
  }, [userId, qc])

  const refreshUnreadCount = useCallback(async () => {
    if (!userId) return
    await qc.invalidateQueries({ queryKey: qk.notifications.unreadCount(userId) })
  }, [userId, qc])

  // Marcar una como leída — optimista sobre lista + contador.
  const markAsReadMutation = useMutation({
    mutationFn: (notificationId: string) =>
      pb.collection('notifications').update(notificationId, { read: true }),
    onMutate: async (notificationId: string) => {
      const listKey = qk.notifications.list(userId, limit ?? 50)
      const countKey = qk.notifications.unreadCount(userId)
      await Promise.all([
        qc.cancelQueries({ queryKey: listKey }),
        qc.cancelQueries({ queryKey: countKey }),
      ])
      const prevList = qc.getQueryData<AppNotification[]>(listKey)
      const prevCount = qc.getQueryData<number>(countKey)
      const wasUnread = prevList?.find((n) => n.id === notificationId)?.read === false
      qc.setQueryData<AppNotification[]>(listKey, (cur) =>
        cur?.map((n) => (n.id === notificationId ? { ...n, read: true } : n)),
      )
      if (wasUnread) {
        qc.setQueryData<number>(countKey, (c) => Math.max(0, (c ?? 0) - 1))
      }
      return { prevList, prevCount, listKey, countKey }
    },
    onError: (_e, _id, ctx) => {
      if (!ctx) return
      qc.setQueryData(ctx.listKey, ctx.prevList)
      qc.setQueryData(ctx.countKey, ctx.prevCount)
    },
  })

  // Marcar todas como leídas — PB no soporta update batch, así que iteramos.
  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      if (!userId) return
      const unread = await pb.collection('notifications').getFullList({
        filter: pb.filter('user = {:uid} && read = false', { uid: userId }),
        $autoCancel: false,
      })
      await Promise.all(unread.map((n) =>
        pb.collection('notifications').update(n.id, { read: true }).catch(() => {}),
      ))
    },
    onMutate: async () => {
      const listKey = qk.notifications.list(userId, limit ?? 50)
      const countKey = qk.notifications.unreadCount(userId)
      await Promise.all([
        qc.cancelQueries({ queryKey: listKey }),
        qc.cancelQueries({ queryKey: countKey }),
      ])
      const prevList = qc.getQueryData<AppNotification[]>(listKey)
      const prevCount = qc.getQueryData<number>(countKey)
      qc.setQueryData<AppNotification[]>(listKey, (cur) =>
        cur?.map((n) => ({ ...n, read: true })),
      )
      qc.setQueryData<number>(countKey, 0)
      return { prevList, prevCount, listKey, countKey }
    },
    onError: (_e, _v, ctx) => {
      if (!ctx) return
      qc.setQueryData(ctx.listKey, ctx.prevList)
      qc.setQueryData(ctx.countKey, ctx.prevCount)
    },
  })

  const markAsRead = useCallback(
    (notificationId: string) => markAsReadMutation.mutateAsync(notificationId).catch(() => {}),
    [markAsReadMutation],
  )
  const markAllAsRead = useCallback(
    () => markAllAsReadMutation.mutateAsync().catch(() => {}),
    [markAllAsReadMutation],
  )

  // Puente realtime → RQ: nueva notificación del usuario invalida el contador.
  useEffect(() => {
    if (!userId) return
    let unsub: (() => void) | undefined
    const subscribe = async () => {
      try {
        unsub = await pb.collection('notifications').subscribe('*', (e) => {
          if (e.action === 'create' && e.record.user === userId) {
            qc.invalidateQueries({ queryKey: qk.notifications.unreadCount(userId) })
            qc.invalidateQueries({ queryKey: qk.notifications.all })
          }
        })
      } catch { /* realtime no disponible */ }
    }
    subscribe()
    return () => { if (unsub) unsub() }
  }, [userId, qc])

  return {
    notifications,
    unreadCount,
    loading: listQuery.isFetching,
    loadNotifications,
    refreshUnreadCount,
    markAsRead,
    markAllAsRead,
  }
}
