import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { op } from '@calistenia/core/lib/analytics'

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

type BrowserInfo = ReturnType<typeof getBrowserInfo>

// Las seis condiciones originales eran excluyentes entre sí (`isSafari` exige
// que no haya «Chrome» en el UA, y el Firefox de escritorio no manda el token
// «Safari»), así que una cadena ordenada renderiza exactamente lo mismo. El
// último caso hace de fallback: antes, un navegador que no casara con ninguna
// pintaba el hueco vacío.
function manualGuideKey(browser: BrowserInfo): string {
  if (browser.isIOS && browser.isSafari) return 'install.guideIosSafari'
  if (browser.isIOS && browser.isFirefox) return 'install.guideIosFirefox'
  if (browser.isAndroid && browser.isFirefox) return 'install.guideAndroidFirefox'
  if (!browser.isIOS && !browser.isAndroid && browser.isFirefox) return 'install.guideDesktopFirefox'
  if (!browser.isIOS && !browser.isAndroid && browser.isSafari) return 'install.guideDesktopSafari'
  return 'install.guideGeneric'
}

export default function InstallPrompt() {
  const { t } = useTranslation()
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
        op.track('app_installed', { method: 'native_prompt' })
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
      <div className="bg-card border border-border rounded-xl p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              {t('install.title')}
            </p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {t('install.body')}
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="text-muted-foreground hover:text-foreground text-lg leading-none p-1"
            aria-label={t('common.close')}
          >
            &times;
          </button>
        </div>

        {showManualGuide ? (
          <div className="mt-3">
            {/* El `<strong>` va dentro del valor traducido: partir la frase en
                trozos deja al traductor sin la oración completa y el orden de
                las palabras cambia entre idiomas. Mismo patrón que
                `programs.chooseToStartDesc` en ProgramsPage. */}
            <div
              className="text-[11px] text-muted-foreground leading-relaxed [&_strong]:text-foreground"
              dangerouslySetInnerHTML={{ __html: t(manualGuideKey(browser)) }}
            />
            <button
              onClick={handleDismiss}
              className="mt-3 w-full text-sm text-muted-foreground hover:text-foreground py-2 transition-colors"
            >
              {t('install.gotIt')}
            </button>
          </div>
        ) : (
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleInstall}
              className="flex-1 bg-[hsl(var(--lime))] hover:bg-[hsl(var(--lime))]/90 text-lime-foreground text-sm font-semibold rounded-lg px-4 py-2 transition-colors"
            >
              {t('install.install')}
            </button>
            <button
              onClick={handleDismiss}
              className="text-sm text-muted-foreground hover:text-foreground px-3 py-2 transition-colors"
            >
              {t('install.notNow')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
