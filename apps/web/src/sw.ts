/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst, NetworkOnly } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

declare let self: ServiceWorkerGlobalScope

// Precache all assets injected by vite-plugin-pwa
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// ── Navegaciones de la SPA (#690) ────────────────────────────────────────────
//
// Sin esto solo `/` se servía del precache (workbox lo resuelve a `index.html`
// por `directoryIndex`) y CUALQUIER otra ruta —`/session`, `/nutrition`,
// `/profile`— se iba a la red. Es decir: quien abría la PWA instalada veía el
// index VIEJO y quien entraba por un enlace profundo veía el NUEVO, con lo que
// el mismo usuario mezclaba dos bundles según por dónde entrase.
//
// Ahora todas las navegaciones salen del mismo `index.html` precacheado: la app
// es coherentemente vieja hasta que el worker nuevo releva, y coherentemente
// nueva después. Quien decide cuándo ocurre ese relevo es `main.tsx`.
//
// Va DESPUÉS de `precacheAndRoute` a propósito (workbox resuelve en orden de
// registro): las URLs que sí están precacheadas —`/privacy.html`,
// `/delete-account.html`, `/oauth-bridge.html`— las sigue atendiendo el
// precache con su contenido real, no con el shell.
const NAVIGATION_DENYLIST = [
  // PocketBase: API y panel de admin.
  /^\/api\//,
  /^\/_\//,
  // Servidor de IA (chat MCP).
  /^\/mcp(\/|$)/,
  // Blog pre-renderizado. `scripts/prerender-blog.mjs` corre DESPUÉS de
  // `vite build`, así que su HTML no entra en el manifiesto del precache:
  // servir el shell aquí se cargaría el prerender.
  /^\/blog(\/|$)/,
  // Generados por ese mismo script, y por tanto tampoco precacheados.
  /^\/sitemap\.xml$/,
  /^\/robots\.txt$/,
  // Assets con hash del build.
  /^\/assets\//,
  // Cualquier cosa con extensión (iconos, media de ejercicios, las páginas
  // sueltas de `public/`): nunca es una ruta de la SPA.
  /\/[^/?]+\.[^/?]+$/,
]

registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: NAVIGATION_DENYLIST,
  })
)

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

// Version gate + feature flags — NUNCA se cachea, y va ANTES de la regla
// genérica de /api/ porque workbox resuelve las rutas en orden de registro.
// Su razón de ser es poder apagar algo AHORA; servirlo desde una caché de hasta
// un día lo convertiría en un kill switch que tarda 24h en llegar.
// El cliente ya tiene su propio fallback en disco si la red falla
// (packages/core/lib/app-config.ts), así que NetworkOnly no lo deja sin datos.
registerRoute(/\/api\/app-config/i, new NetworkOnly())

// Realtime de PocketBase (#690) — igual que app-config, NUNCA pasa por caché, y
// por el mismo motivo va ANTES de la regla genérica de /api/.
//
// `/api/realtime` es un GET a un `text/event-stream` que NO termina nunca: es la
// suscripción viva. La regla genérica lo trataba como una respuesta normal, así
// que lo hacía competir contra su propio `networkTimeoutSeconds: 5` —a los 5 s
// una suscripción recién abierta ya cuenta como «red lenta»— e intentaba meter
// un flujo infinito en `cache.put`. Un stream que no acaba no se puede cachear.
registerRoute(/\/api\/realtime/i, new NetworkOnly())

// API calls — NetworkFirst, 5s timeout.
//
// 5 min de caché, no 24 h (#690): quien manda offline es React Query con su
// caché persistida (`gcTime` de 24 h, packages/core/lib/query-client.ts), y
// ESTA caché queda por debajo de aquella. Con un día de vida servía respuestas
// rancias por detrás de React Query, y fue una de las vías por las que prod
// seguía pintando como viejas filas que ya se habían reparado. 5 min cubren su
// verdadero trabajo —un bache de red— sin sobrevivir a un arreglo de datos.
registerRoute(
  /\/api\/.*/i,
  new NetworkFirst({
    cacheName: 'api-cache',
    plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 300 })],
    networkTimeoutSeconds: 5,
  })
)

// Handle push events — show notification
self.addEventListener('push', (event) => {
  if (!event.data) return

  const data = event.data.json()
  // Fallback title — push data should include a translated title from the server
  const title = data.title || 'Calistenia App'
  const options: NotificationOptions & { vibrate?: number[] } = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/nutrition', campaign: data.campaign },
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
  const notifTitle = event.notification.title || ''

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If there's already an open tab, focus it and notify for analytics
      for (const client of windowClients) {
        if ('focus' in client) {
          client.postMessage({
            type: 'NOTIFICATION_CLICKED',
            url: targetUrl,
            title: notifTitle,
            campaign: event.notification.data?.campaign,
          })
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
  // Fallback strings — the page sends translated reminders via postMessage.
  // These are only used if the SW fires a timer directly (OS froze the page).
  const titles: Record<string, string> = {
    meal: reminder.label,
    workout: 'Time to work out! / Hora de entrenar!',
    pause: 'Active Break / Pausa Activa',
  }
  const bodies: Record<string, string> = {
    meal: "Don't skip this meal / No te saltes esta comida",
    workout: "Your workout is waiting / Tu entrenamiento te espera",
    pause: "Stand up, stretch and move / Levántate, estira y muévete",
  }
  const urls: Record<string, string> = {
    meal: '/nutrition',
    workout: '/workout',
    pause: '/workout',
  }

  self.registration.showNotification(titles[reminder.type] || 'Reminder', {
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
        fireSWNotification(r)
        scheduledTimers.delete(r.id)
      }, delay)
      scheduledTimers.set(r.id, timer)
    }
  }


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
