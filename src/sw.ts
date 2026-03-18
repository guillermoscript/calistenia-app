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
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    data: { url: data.url || '/nutrition' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
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

// Auto-activate new service worker immediately
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', () => self.clients.claim())
