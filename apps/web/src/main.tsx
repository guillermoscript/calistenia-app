import "./instrument";              // Sentry — MUST be first import
import "./lib/init-core";           // Platform adapter de @calistenia/core — MUST be second

import React, { type ErrorInfo } from 'react'
import ReactDOM from 'react-dom/client'
import { reactErrorHandler, lastEventId } from "@sentry/react"
import { BrowserRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import { registerSW } from 'virtual:pwa-register'
import { toast } from 'sonner'
import i18n from './lib/i18n'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from '@calistenia/core/lib/analytics'
import App from './App'
import './index.css'

// Register SW in prompt mode: checks every 60s + on tab focus.
// Shows a toast so the user can update when ready (no surprise reloads).
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    toast(i18n.t('toast.newVersion'), {
      description: i18n.t('toast.newVersionDesc'),
      action: {
        label: i18n.t('toast.update'),
        onClick: () => updateSW(true),
      },
      duration: Infinity,
    })
  },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return

    setInterval(() => {
      registration.update().catch(() => {})
    }, 60 * 1000)

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        registration.update().catch(() => {})
      }
    })
  },
})

// Stale-chunk recovery after a deploy: users still on the old index.html request
// chunk hashes that no longer exist on the server. Vite wraps every lazy() import
// in __vitePreload and dispatches `vite:preloadError` on a failed fetch (Sentry
// "Failed to fetch dynamically imported module"). Reload once to pull the fresh
// index + chunks. The 10s window breaks a reload loop if the chunk is truly gone.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault() // stop Vite from re-throwing into the app
  const KEY = 'vite-preload-reload-at'
  const last = Number(sessionStorage.getItem(KEY) || 0)
  if (Date.now() - last < 10_000) return
  sessionStorage.setItem(KEY, String(Date.now()))
  window.location.reload()
})

// Track push notification clicks forwarded from the service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'NOTIFICATION_CLICKED') {
      trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.notificationClicked, {
        surface: 'notification', source: 'service_worker',
        url: event.data.url, title: event.data.title,
      })
    }
  })
}

const trackAndHandleError = (type: string) => {
  const sentryHandler = reactErrorHandler()
  return (error: unknown, errorInfo: ErrorInfo) => {
    // Sentry primero: así `lastEventId()` ya apunta a ESTE error y el
    // `page_error` de OpenPanel lleva el puente al evento exacto de Sentry.
    sentryHandler(error, errorInfo)
    trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.pageError, {
      surface: 'app', source: 'react_root', error_type: type,
      message: error instanceof Error ? error.message : String(error),
      sentry_event_id: lastEventId(),
    })
  }
}

ReactDOM.createRoot(document.getElementById('root')!, {
  onUncaughtError: trackAndHandleError('uncaught'),
  onCaughtError: trackAndHandleError('caught'),
  onRecoverableError: trackAndHandleError('recoverable'),
}).render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </I18nextProvider>
  </React.StrictMode>
)
