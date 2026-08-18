import { useCallback, useRef, useState, type RefObject } from 'react'
import { Image } from 'expo-image'

import type { ShareCardCaptureHandle } from '@/components/share/ShareCardCapture'

/**
 * Tope de espera para el prefetch de imágenes (mapas, fotos…) antes de
 * capturar la tarjeta. Si el prefetch no termina a tiempo, se captura de
 * todas formas — mejor una imagen a medio cargar que un share colgado.
 */
const PREFETCH_TIMEOUT = 2500

export interface UseShareCardCaptureOptions {
  /**
   * Recibe el URI del PNG ya capturado y hace lo que sea propio de cada
   * botón: construir el mensaje, llamar a la función de share y trackear el
   * contexto de analítica.
   */
  onCapture: (uri: string) => Promise<void> | void
  /**
   * URLs a precargar con `expo-image` antes de capturar, para que la tarjeta
   * fuera de pantalla no se capture en blanco. Si se omite, no hay prefetch.
   */
  prefetchUrls?: string[]
  /**
   * Se invoca si el prefetch, la captura o `onCapture` lanzan — por ejemplo,
   * al cancelar la hoja de compartir. Por defecto no hace nada (equivalente
   * al catch silencioso original); cada botón puede loguear o reportar a
   * Sentry si eso es lo que hacía antes de la extracción.
   */
  onError?: (error: unknown) => void
}

export interface UseShareCardCaptureResult {
  /** Pásalo a `<ShareCardCapture ref={captureRef}>`. */
  captureRef: RefObject<ShareCardCaptureHandle | null>
  /** true mientras el prefetch, la captura y el share están en curso. */
  sharing: boolean
  /** Dispara la tubería completa: prefetch → RAF → captura → `onCapture`. */
  share: () => Promise<void>
}

/**
 * useShareCardCapture — tubería común de los botones "compartir tarjeta"
 * (WorkoutShareButton, CardioShareButton, BattleResultShareButton,
 * ProgressShareButton). Encapsula el ref de `ShareCardCapture`, el flag
 * `sharing`, el prefetch opcional de imágenes con un único
 * `PREFETCH_TIMEOUT`, el `requestAnimationFrame` que evita una captura en
 * blanco y el guard/try/catch/finally alrededor de `capture()`. Lo que
 * cambia entre botones — qué precargar y qué hacer con el URI capturado —
 * lo aporta el llamador (#488).
 */
export function useShareCardCapture({
  onCapture,
  prefetchUrls,
  onError,
}: UseShareCardCaptureOptions): UseShareCardCaptureResult {
  const captureRef = useRef<ShareCardCaptureHandle>(null)
  const [sharing, setSharing] = useState(false)

  const share = useCallback(async () => {
    if (sharing) return
    setSharing(true)
    try {
      if (prefetchUrls && prefetchUrls.length > 0) {
        await Promise.race([
          Promise.all(prefetchUrls.map((url) => Image.prefetch(url))),
          new Promise<void>((resolve) => setTimeout(resolve, PREFETCH_TIMEOUT)),
        ])
      }

      // Fonts are already loaded by _layout boot; RAF guards against a blank capture.
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))

      const uri = await captureRef.current?.capture()
      if (!uri) return

      await onCapture(uri)
    } catch (error) {
      onError?.(error)
    } finally {
      setSharing(false)
    }
  }, [sharing, prefetchUrls, onCapture, onError])

  return { captureRef, sharing, share }
}
