import { useState, useCallback, useEffect } from 'react'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'

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

export function useNotifications(userId: string | null) {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)

  // Load notifications (paginated)
  const loadNotifications = useCallback(async (limit = 50) => {
    if (!userId) return
    const available = await isPocketBaseAvailable()
    if (!available) return

    setLoading(true)
    try {
      const res = await pb.collection('notifications').getList(1, limit, {
        filter: pb.filter('user = {:uid}', { uid: userId }),
        sort: '-created',
        expand: 'actor',
        $autoCancel: false,
      })

      const items: AppNotification[] = res.items.map((r: any) => ({
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
      }))

      setNotifications(items)
      setUnreadCount(items.filter(n => !n.read).length)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [userId])

  // Get unread count (lightweight query)
  const refreshUnreadCount = useCallback(async () => {
    if (!userId) return
    const available = await isPocketBaseAvailable()
    if (!available) return

    try {
      const res = await pb.collection('notifications').getList(1, 1, {
        filter: pb.filter('user = {:uid} && read = false', { uid: userId }),
        $autoCancel: false,
      })
      setUnreadCount(res.totalItems)
    } catch { /* silent */ }
  }, [userId])

  // Mark single as read
  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      await pb.collection('notifications').update(notificationId, { read: true })
      setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, read: true } : n))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch { /* silent */ }
  }, [])

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    if (!userId) return
    const available = await isPocketBaseAvailable()
    if (!available) return

    try {
      // Get all unread
      const unread = await pb.collection('notifications').getFullList({
        filter: pb.filter('user = {:uid} && read = false', { uid: userId }),
        $autoCancel: false,
      })

      // Update each (PocketBase doesn't support batch updates)
      await Promise.all(unread.map(n =>
        pb.collection('notifications').update(n.id, { read: true }).catch(() => {})
      ))

      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      setUnreadCount(0)
    } catch { /* silent */ }
  }, [userId])

  // Create a notification (called by other hooks as side effect)
  const createNotification = useCallback(async (
    targetUserId: string,
    type: NotificationType,
    referenceId: string,
    referenceType: string,
    data?: Record<string, any>
  ) => {
    if (!userId || userId === targetUserId) return // Don't notify yourself
    const available = await isPocketBaseAvailable()
    if (!available) return

    try {
      await pb.collection('notifications').create({
        user: targetUserId,
        type,
        actor: userId,
        reference_id: referenceId,
        reference_type: referenceType,
        read: false,
        data: data || {},
      })
    } catch { /* silent — notification creation is non-critical */ }
  }, [userId])

  // Subscribe to realtime updates for live badge
  useEffect(() => {
    if (!userId) return

    let unsub: (() => void) | undefined

    const subscribe = async () => {
      const available = await isPocketBaseAvailable()
      if (!available) return

      try {
        unsub = await pb.collection('notifications').subscribe('*', (e) => {
          if (e.action === 'create' && e.record.user === userId) {
            refreshUnreadCount()
          }
        })
      } catch { /* realtime not available */ }
    }

    subscribe()

    return () => {
      if (unsub) unsub()
    }
  }, [userId, refreshUnreadCount])

  // Initial unread count load
  useEffect(() => {
    refreshUnreadCount()
  }, [refreshUnreadCount])

  return {
    notifications,
    unreadCount,
    loading,
    loadNotifications,
    refreshUnreadCount,
    markAsRead,
    markAllAsRead,
    createNotification,
  }
}
