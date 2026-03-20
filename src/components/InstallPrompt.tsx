import { useState, useEffect, useRef } from 'react'

const DISMISS_KEY = 'calistenia_install_dismiss'
const DISMISS_DAYS = 14

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as any).standalone === true
}

function getBrowserInfo(): { isFirefox: boolean; isSafari: boolean; isChromium: boolean; isIOS: boolean; isAndroid: boolean } {
  const ua = navigator.userAgent
  return {
    isFirefox: /Firefox/i.test(ua),
    isSafari: /Safari/i.test(ua) && !/Chrome/i.test(ua),
    isChromium: /Chrome/i.test(ua) && !/Edge/i.test(ua),
    isIOS: /iPad|iPhone|iPod/.test(ua),
    isAndroid: /Android/i.test(ua),
  }
}

export default function InstallPrompt() {
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [showManualGuide, setShowManualGuide] = useState(false)

  useEffect(() => {
    // Already installed as PWA
    if (isStandalone()) return

    // Check if dismissed recently
    const dismissedAt = localStorage.getItem(DISMISS_KEY)
    if (dismissedAt) {
      const elapsed = Date.now() - parseInt(dismissedAt, 10)
      if (elapsed < DISMISS_DAYS * 24 * 60 * 60 * 1000) return
    }

    // Chromium browsers fire beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault()
      deferredPrompt.current = e as BeforeInstallPromptEvent
      setShowPrompt(true)
    }
    window.addEventListener('beforeinstallprompt', handler)

    // For Firefox/Safari — show manual guide after a delay (no native prompt)
    const timeout = setTimeout(() => {
      if (!deferredPrompt.current) {
        setShowManualGuide(true)
        setShowPrompt(true)
      }
    }, 5000)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      clearTimeout(timeout)
    }
  }, [])

  const handleInstall = async () => {
    if (deferredPrompt.current) {
      await deferredPrompt.current.prompt()
      const { outcome } = await deferredPrompt.current.userChoice
      if (outcome === 'accepted') {
        setShowPrompt(false)
      }
      deferredPrompt.current = null
    }
  }

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString())
    setShowPrompt(false)
  }

  if (!showPrompt) return null

  const browser = getBrowserInfo()

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[100] max-w-sm mx-auto">
      <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-zinc-100">
              Instala Calistenia como app
            </p>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              Recibe notificaciones, accede sin conexion y abre mas rapido desde tu pantalla de inicio
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

        {showManualGuide ? (
          <div className="mt-3">
            <div className="text-[11px] text-zinc-300 leading-relaxed">
              {browser.isIOS && browser.isSafari && (
                <>Toca el boton <strong className="text-zinc-100">Compartir</strong> (cuadrado con flecha) y luego <strong className="text-zinc-100">Agregar a inicio</strong></>
              )}
              {browser.isIOS && browser.isFirefox && (
                <>Abre esta pagina en <strong className="text-zinc-100">Safari</strong>, toca <strong className="text-zinc-100">Compartir</strong> y luego <strong className="text-zinc-100">Agregar a inicio</strong></>
              )}
              {browser.isAndroid && browser.isFirefox && (
                <>Toca el menu <strong className="text-zinc-100">⋮</strong> y selecciona <strong className="text-zinc-100">Instalar</strong> o <strong className="text-zinc-100">Agregar a inicio</strong></>
              )}
              {!browser.isIOS && !browser.isAndroid && browser.isFirefox && (
                <>Abre el menu y busca <strong className="text-zinc-100">Instalar este sitio como aplicacion</strong> en la barra de direcciones</>
              )}
              {!browser.isIOS && !browser.isAndroid && browser.isSafari && (
                <>Ve a <strong className="text-zinc-100">Archivo → Agregar al Dock</strong> para instalar como app</>
              )}
              {!browser.isFirefox && !browser.isSafari && !browser.isIOS && (
                <>Busca el icono de instalar en la barra de direcciones de tu navegador</>
              )}
            </div>
            <button
              onClick={handleDismiss}
              className="mt-3 w-full text-sm text-zinc-400 hover:text-zinc-200 py-2 transition-colors"
            >
              Entendido
            </button>
          </div>
        ) : (
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
        )}
      </div>
    </div>
  )
}
