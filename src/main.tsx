import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import { registerSW } from 'virtual:pwa-register'
import { toast } from 'sonner'
import i18n from './lib/i18n'
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
      registration.update()
    }, 60 * 1000)

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        registration.update()
      }
    })
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </I18nextProvider>
  </React.StrictMode>
)
