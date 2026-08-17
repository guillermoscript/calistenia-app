// Copia literal de apps/web/src/hooks/cardio/useCardioTimer.ts: lo específico de
// plataforma entra por `canRestartGps`. Candidato a `packages/core`, pero eso es
// el #482; aquí sólo se parten los contextos.
import { useCallback, useEffect, useRef, useState } from 'react'

// El GPS puede morir en silencio: el watch queda registrado pero deja de emitir.
// Si no llega un fix aceptado en 15 s se relanza, con 30 s de enfriamiento para
// no entrar en un bucle de reinicios cuando simplemente no hay cobertura.
const GPS_SILENCE_MS = 15_000
const GPS_RESTART_COOLDOWN_MS = 30_000

interface Options {
  getStartTime: () => number
  getPausedDuration: () => number
  /** ¿Se puede relanzar el GPS ahora? (sesión activa y app en primer plano). */
  canRestartGps: () => boolean
  /** El GPS lleva demasiado tiempo mudo: relanzarlo. */
  onGpsStalled: () => void
}

export interface CardioTimer {
  duration: number
  setDuration: (seconds: number) => void
  start: () => void
  stop: () => void
  /** Marca que acaba de entrar un fix aceptado (alimenta el health-check). */
  noteGpsFix: () => void
  /** Olvida el historial del health-check (al empezar una sesión nueva). */
  resetGpsHealth: () => void
}

/**
 * Cronómetro de la sesión de cardio y vigilancia del GPS.
 *
 * La duración se recalcula desde `startTime` en cada tick en vez de acumular
 * segundos: así un tick perdido (pestaña en segundo plano, proceso congelado)
 * no descuadra el total.
 */
export function useCardioTimer({
  getStartTime, getPausedDuration, canRestartGps, onGpsStalled,
}: Options): CardioTimer {
  const [duration, setDuration] = useState(0)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastGpsFixRef = useRef(0)
  const lastGpsRestartRef = useRef(0)

  // Los callbacks se releen por ref: el intervalo vive minutos u horas y no
  // debe reiniciarse porque el provider haya re-renderizado.
  const optionsRef = useRef({ getStartTime, getPausedDuration, canRestartGps, onGpsStalled })
  optionsRef.current = { getStartTime, getPausedDuration, canRestartGps, onGpsStalled }

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const start = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      const { getStartTime: at, getPausedDuration: paused, canRestartGps: can, onGpsStalled: stalled } = optionsRef.current
      setDuration(Math.floor((Date.now() - at() - paused()) / 1000))

      const now = Date.now()
      if (
        can() &&
        lastGpsFixRef.current > 0 &&
        now - lastGpsFixRef.current > GPS_SILENCE_MS &&
        now - lastGpsRestartRef.current > GPS_RESTART_COOLDOWN_MS
      ) {
        lastGpsRestartRef.current = now
        stalled()
      }
    }, 1000)
  }, [])

  const noteGpsFix = useCallback(() => { lastGpsFixRef.current = Date.now() }, [])

  const resetGpsHealth = useCallback(() => {
    lastGpsFixRef.current = 0
    lastGpsRestartRef.current = 0
  }, [])

  useEffect(() => stop, [stop])

  return { duration, setDuration, start, stop, noteGpsFix, resetGpsHealth }
}
