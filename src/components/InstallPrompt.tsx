import { useState, useEffect, useRef } from 'react'

const DISMISS_KEY = 'calistenia_install_dismiss'
const DISMISS_DAYS = 7

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallPrompt() {
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)

  useEffect(() => {
    // Only show on mobile
    if (window.innerWidth >= 768) return

    // Check if dismissed recently
    const dismissedAt = localStorage.getItem(DISMISS_KEY)
    if (dismissedAt) {
      const elapsed = Date.now() - parseInt(dismissedAt, 10)
      if (elapsed < DISMISS_DAYS * 24 * 60 * 60 * 1000) return
    }

    const handler = (e: Event) => {
      e.preventDefault()
      deferredPrompt.current = e as BeforeInstallPromptEvent
      setShowPrompt(true)
    }

    window.addEventListener('beforeinstallprompt', handler)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
    }
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt.current) return
    await deferredPrompt.current.prompt()
    const { outcome } = await deferredPrompt.current.userChoice
    if (outcome === 'accepted') {
      setShowPrompt(false)
    }
    deferredPrompt.current = null
  }

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString())
    setShowPrompt(false)
  }

  if (!showPrompt) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[100] max-w-sm mx-auto">
      <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-zinc-100">
              Instala Calistenia como app
            </p>
            <p className="text-xs text-zinc-400 mt-1">
              Acceso rapido desde tu pantalla de inicio
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="text-zinc-500 hover:text-zinc-300 text-lg leading-none p-1"
            aria-label="Cerrar"
          >
            &times;
          </button>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={handleInstall}
            className="flex-1 bg-lime-500 hover:bg-lime-400 text-zinc-900 text-sm font-semibold rounded-lg px-4 py-2 transition-colors"
          >
            Instalar
          </button>
          <button
            onClick={handleDismiss}
            className="text-sm text-zinc-400 hover:text-zinc-200 px-3 py-2 transition-colors"
          >
            Ahora no
          </button>
        </div>
      </div>
    </div>
  )
}
