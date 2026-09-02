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
import { hasActiveWorkout } from './lib/active-workout'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from '@calistenia/core/lib/analytics'
import App from './App'
import './index.css'

// ── Actualización del service worker (#690) ──────────────────────────────────
//
// El SW sigue en modo `prompt`, pero el aviso ya no es la única vía: se aplica
// SOLO cuando no hay nada que perder, y solo se pregunta cuando sí lo hay.
//
// El motivo de #690: el aviso salía UNA vez por carga (evento `waiting`), era
// descartable y nada lo volvía a armar, así que un cliente podía seguir con el
// bundle viejo 12 h después de un deploy. Ahora cada chequeo (cada 60 s y al
// volver a la pestaña) mira si hay un worker esperando y vuelve a decidir.
//
// La razón de conservar el modo `prompt` no cambia: recargar a mitad de una
// serie tira el cronómetro y el progreso sin subir. Por eso el único caso en
// que se pregunta es con un entreno en curso (`hasActiveWorkout`).

const SW_UPDATE_TOAST_ID = 'sw-update'
// Un entreno puede durar más de una hora, y el chequeo corre cada 60 s: sin
// esto, descartar el aviso lo devolvía al minuto siguiente, una y otra vez.
const SW_TOAST_COOLDOWN_MS = 10 * 60 * 1000
let updateToastDismissedAt = 0

function promptForUpdate(apply: () => void) {
  if (updateToastDismissedAt && Date.now() - updateToastDismissedAt < SW_TOAST_COOLDOWN_MS) return
  // El `id` fijo hace que sonner reemplace el aviso en vez de apilar uno nuevo
  // en cada chequeo mientras el usuario entrena.
  toast(i18n.t('toast.newVersion'), {
    id: SW_UPDATE_TOAST_ID,
    description: i18n.t('toast.newVersionDesc'),
    action: {
      label: i18n.t('toast.update'),
      onClick: apply,
    },
    duration: Infinity,
    onDismiss: () => { updateToastDismissedAt = Date.now() },
  })
}

// Hay un worker nuevo esperando: aplicarlo o avisar.
//
// Se aplica solo cuando recargar no interrumpe nada: nada más cargar la página
// (`atLoad`, aún no hay nada escrito) o con la app en segundo plano (la recarga
// ocurre sin que se vea). Con la pestaña delante y en uso —un formulario de
// comida a medias, por ejemplo— o con un entreno en curso, se pregunta: sigue
// sin haber recargas sorpresa. En móvil la app pasa a segundo plano decenas de
// veces al día, así que el relevo llega igual sin que nadie pulse nada.
function applyUpdateOrPrompt(atLoad = false) {
  const apply = () => { void updateSW(true) }
  if (hasActiveWorkout()) {
    promptForUpdate(apply)
    return
  }
  if (atLoad || document.visibilityState === 'hidden') {
    apply()
    return
  }
  promptForUpdate(apply)
}

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh: () => applyUpdateOrPrompt(),
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return

    // `update()` busca un SW nuevo en el servidor; `waiting` es el que ya se
    // descargó y está parado esperando el relevo. Se mira ANTES de pedir el
    // update porque el que sobró de una carga anterior ya está ahí, y su
    // evento `waiting` no se vuelve a emitir.
    const check = (atLoad = false) => {
      if (registration.waiting) applyUpdateOrPrompt(atLoad)
      registration.update().catch(() => {})
    }

    check(true)
    setInterval(() => check(), 60 * 1000)

    // Al volver: buscar worker nuevo. Al irse a segundo plano: si ya hay uno
    // esperando y no hay entreno, es el momento de aplicarlo sin molestar.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
      else if (registration.waiting && !hasActiveWorkout()) applyUpdateOrPrompt()
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
