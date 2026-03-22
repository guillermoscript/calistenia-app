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
  const options: NotificationOptions = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/nutrition' },
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

// Activate new service worker when the user accepts the update prompt
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
self.addEventListener('activate', () => self.clients.claim())
