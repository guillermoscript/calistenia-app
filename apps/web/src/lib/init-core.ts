/**
 * Inicialización de @calistenia/core para web.
 *
 * DEBE ser de los primeros imports de main.tsx (solo después de Sentry):
 * los módulos de core leen el platform adapter al evaluarse.
 */
import * as Sentry from '@sentry/react'
import { OpenPanel } from '@openpanel/web'
import { initCore } from '@calistenia/core/platform'

const op = new OpenPanel({
  apiUrl: 'https://openpanel.guille.tech/api',
  clientId: import.meta.env.VITE_OPENPANEL_CLIENT_ID ?? '95f75c3f-fb38-4c0b-a401-a3a63f8b91f5',
  trackScreenViews: true,
  trackOutgoingLinks: true,
  trackAttributes: true,
})

// Lightweight health check — logs to console if analytics endpoint is unreachable.
// Runs once on load so you know if ad blockers or network issues are silently dropping events.
if (typeof window !== 'undefined') {
  fetch('https://openpanel.guille.tech/api', { method: 'HEAD', mode: 'no-cors' }).catch(() => {
    console.warn('[analytics] OpenPanel endpoint unreachable — events may be blocked by ad blocker or network issue')
  })
}

initCore({
  storage: localStorage,
  env: {
    // Vacío en prod → la web se sirve desde el propio PocketBase
    pbUrl: import.meta.env.VITE_POCKETBASE_URL || (import.meta.env.DEV ? 'http://127.0.0.1:8090' : window.location.origin),
    // Vacío en dev → el proxy de Vite maneja /api/*
    aiApiUrl: import.meta.env.VITE_AI_API_URL || (import.meta.env.DEV ? '' : 'https://test.guille.tech'),
    isDev: import.meta.env.DEV,
  },
  analytics: {
    track: (name, properties) => op.track(name, properties),
    // El payload del facade es laxo; OpenPanel exige profileId — los callers de core siempre lo mandan.
    identify: (payload) => op.identify(payload as Parameters<typeof op.identify>[0]),
    clear: () => op.clear(),
  },
  reportError: (e) => Sentry.captureException(e),
  connectivity: {
    isOnline: () => navigator.onLine,
    onOnline: (handler) => {
      window.addEventListener('online', handler)
      return () => window.removeEventListener('online', handler)
    },
  },
})
