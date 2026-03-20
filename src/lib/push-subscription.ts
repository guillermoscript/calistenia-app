import { pb } from './pocketbase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

/** Detect what notification capabilities the current browser supports */
export function getNotificationSupport(): {
  notifications: boolean
  pushManager: boolean
  serviceWorker: boolean
  vapidConfigured: boolean
  permission: NotificationPermission | 'unsupported'
} {
  const notifications = 'Notification' in window
  return {
    notifications,
    pushManager: 'PushManager' in window,
    serviceWorker: 'serviceWorker' in navigator,
    vapidConfigured: !!VAPID_PUBLIC_KEY,
    permission: notifications ? Notification.permission : 'unsupported',
  }
}

/** Request basic notification permission (works on all browsers that support Notification API) */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}

export async function subscribeToPush(userId: string): Promise<boolean> {
  if (!VAPID_PUBLIC_KEY || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false
  }

  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return false

    const registration = await navigator.serviceWorker.ready
    let subscription = await registration.pushManager.getSubscription()

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
      })
    }

    // Save to PocketBase
    const subJson = subscription.toJSON()
    try {
      // Check if subscription already exists
      await pb.collection('push_subscriptions').getFirstListItem(
        pb.filter('user = {:uid} && subscription.endpoint = {:ep}', {
          uid: userId,
          ep: subJson.endpoint,
        })
      )
      // Already exists
    } catch {
      // Not found — create
      await pb.collection('push_subscriptions').create({
        user: userId,
        subscription: JSON.stringify(subJson),
        user_agent: navigator.userAgent,
      })
    }

    return true
  } catch (e) {
    console.warn('Failed to subscribe to push:', e)
    return false
  }
}

export async function unsubscribeFromPush(userId: string): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()

    if (subscription) {
      const endpoint = subscription.endpoint
      await subscription.unsubscribe()

      // Remove from PocketBase
      try {
        const rec = await pb.collection('push_subscriptions').getFirstListItem(
          pb.filter('user = {:uid} && subscription.endpoint = {:ep}', {
            uid: userId,
            ep: endpoint,
          })
        )
        await pb.collection('push_subscriptions').delete(rec.id)
      } catch { /* ignore */ }
    }
  } catch (e) {
    console.warn('Failed to unsubscribe from push:', e)
  }
}

export async function getSubscriptionStatus(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
  try {
    const registration = await navigator.serviceWorker.ready
    const sub = await registration.pushManager.getSubscription()
    return !!sub
  } catch {
    return false
  }
}
