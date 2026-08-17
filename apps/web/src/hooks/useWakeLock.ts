import { useEffect, useRef } from 'react'

/**
 * Mantiene la pantalla encendida mientras `active` sea true.
 *
 * Unifica las tres copias del mismo bloque que había en `CardioSessionContext`,
 * `RaceContext` y `CircuitView`. Dos detalles que cada copia resolvía a medias:
 *
 * - iOS Safari suelta el wake lock al pasar la pestaña a segundo plano y no lo
 *   devuelve al volver, así que hay que volver a pedirlo en cada `visible`.
 * - El navegador también puede soltarlo por su cuenta (batería baja). Sin
 *   escuchar el evento `release`, el sentinel muerto se queda en el ref y la
 *   re-adquisición lo confunde con un lock vivo y ya no reintenta nunca.
 */
export function useWakeLock(active: boolean) {
  const sentinelRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    if (!active) return

    let cancelled = false

    const request = async () => {
      if (cancelled || sentinelRef.current) return
      try {
        if (!('wakeLock' in navigator)) return
        const sentinel = await navigator.wakeLock.request('screen')
        // El efecto pudo limpiarse mientras la promesa estaba en vuelo.
        if (cancelled) {
          void sentinel.release?.().catch(() => {})
          return
        }
        sentinelRef.current = sentinel
        sentinel.addEventListener?.('release', () => {
          if (sentinelRef.current === sentinel) sentinelRef.current = null
        })
      } catch { /* no soportado, denegado o batería baja — ignorar */ }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void request()
    }

    void request()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      sentinelRef.current?.release?.().catch(() => {})
      sentinelRef.current = null
    }
  }, [active])
}
