/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

declare let self: ServiceWorkerGlobalScope

// Precache all assets injected by vite-plugin-pwa
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Google Fonts — CacheFirst, 1 year
registerRoute(
  /^https:\/\/fonts\.googleapis\.com\/.*/i,
  new CacheFirst({
    cacheName: 'google-fonts-cache',
    plugins: [new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 31536000 })],
  })
)
registerRoute(
  /^https:\/\/fonts\.gstatic\.com\/.*/i,
  new CacheFirst({
    cacheName: 'gstatic-fonts-cache',
    plugins: [new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 31536000 })],
  })
)

// API calls — NetworkFirst, 5s timeout, 1 day cache
registerRoute(
  /\/api\/.*/i,
  new NetworkFirst({
    cacheName: 'api-cache',
    plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 86400 })],
    networkTimeoutSeconds: 5,
  })
)

// Handle push events — show notification
self.addEventListener('push', (event) => {
  if (!event.data) return

  const data = event.data.json()
  const title = data.title || 'Calistenia App'
  const options: NotificationOptions & { vibrate?: number[] } = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/nutrition' },
    vibrate: [200, 100, 200],
    requireInteraction: true,
  }

  event.waitUntil(
    self.registration.showNotification(title, options).then(() => {
      // Forward job completion data to open clients for in-app toast
      const jobMatch = data.url?.match(/[?&]job=([^&]+)/)
      if (!jobMatch) return
      return self.clients.matchAll({ type: 'window' }).then(clients => {
        const payload = { type: 'AI_JOB_COMPLETE', job_id: jobMatch[1], ...data }
        clients.forEach(client => client.postMessage(payload))
      })
    })
  )
})

// Handle notification click — focus the app window
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If there's already an open tab, focus it
      for (const client of windowClients) {
        if ('focus' in client) {
          return (client as WindowClient).navigate(targetUrl).then(c => c?.focus())
        }
      }
      // Otherwise open a new tab
      return self.clients.openWindow(targetUrl)
    })
  )
})

// ── Scheduled reminder notifications ──────────────────────────────────────────
// The page sends the full reminder schedule to the SW via postMessage.
// The SW maintains its own timers so notifications fire even when the page
// is backgrounded on mobile (SW timers survive longer than page timers).

interface SWReminder {
  id: string
  type: 'meal' | 'workout' | 'pause'
  hour: number
  minute: number
  daysOfWeek: number[]
  enabled: boolean
  label: string
}

const scheduledTimers = new Map<string, ReturnType<typeof setTimeout>>()
let swCheckInterval: ReturnType<typeof setInterval> | null = null
let swReminders: SWReminder[] = []

function isTodayIncludedSW(daysOfWeek: number[]): boolean {
  return Array.isArray(daysOfWeek) && daysOfWeek.includes(new Date().getDay())
}

function fireSWNotification(reminder: SWReminder): void {
  const titles: Record<string, string> = {
    meal: reminder.label,
    workout: 'Hora de entrenar!',
    pause: 'Pausa Activa',
  }
  const bodies: Record<string, string> = {
    meal: 'No te saltes esta comida — tu cuerpo lo necesita',
    workout: 'Tu entrenamiento te espera. No pierdas la racha!',
    pause: 'Levántate, estira y muévete — tu cuerpo lo agradece',
  }
  const urls: Record<string, string> = {
    meal: '/nutrition',
    workout: '/workout',
    pause: '/workout',
  }

  self.registration.showNotification(titles[reminder.type] || 'Recordatorio', {
    body: bodies[reminder.type] || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: `sw-${reminder.type}-${reminder.id}`,
    data: { url: urls[reminder.type] || '/' },
    vibrate: [200, 100, 200],
    requireInteraction: true,
  } as NotificationOptions)
}

function scheduleSWReminders(reminders: SWReminder[]): void {
  console.log(`[sw-reminders] received ${reminders.length} reminders`)
  // Clear existing timers
  for (const timer of scheduledTimers.values()) clearTimeout(timer)
  scheduledTimers.clear()
  swReminders = reminders

  const now = new Date()

  for (const r of reminders) {
    if (!r.enabled || !isTodayIncludedSW(r.daysOfWeek)) continue

    const target = new Date()
    target.setHours(r.hour, r.minute, 0, 0)
    const delay = target.getTime() - now.getTime()

    if (delay > 0 && delay < 24 * 60 * 60 * 1000) {
      const timer = setTimeout(() => {
        console.log(`[sw-reminders] firing: ${r.type} "${r.label}" at ${r.hour}:${String(r.minute).padStart(2, '0')}`)
        fireSWNotification(r)
        scheduledTimers.delete(r.id)
      }, delay)
      scheduledTimers.set(r.id, timer)
    }
  }

  console.log(`[sw-reminders] scheduled ${scheduledTimers.size} timers for today`)

  // Periodic safety check every 60s — catches timers frozen by the OS
  if (swCheckInterval) clearInterval(swCheckInterval)
  if (reminders.some(r => r.enabled)) {
    let lastMinute = -1
    swCheckInterval = setInterval(() => {
      const n = new Date()
      const currentMin = n.getHours() * 60 + n.getMinutes()
      if (currentMin === lastMinute) return
      lastMinute = currentMin

      for (const r of swReminders) {
        if (!r.enabled || !isTodayIncludedSW(r.daysOfWeek)) continue
        if (r.hour * 60 + r.minute === currentMin && !scheduledTimers.has(r.id)) {
          fireSWNotification(r)
        }
      }
    }, 30_000)
  }
}

// Activate new service worker when the user accepts the update prompt
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
  if (event.data && event.data.type === 'SCHEDULE_REMINDERS') {
    scheduleSWReminders(event.data.reminders || [])
  }
})
self.addEventListener('activate', () => self.clients.claim())
