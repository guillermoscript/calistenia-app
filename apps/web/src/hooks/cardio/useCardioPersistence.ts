import { useCallback, useEffect, useRef } from 'react'
import { CARDIO_ACTIVE_KEY as STORAGE_KEY } from '@calistenia/core/lib/storage-keys'
import type { CardioActivityType, GpsPoint } from '@calistenia/core/types'

/** Snapshot con el que se reconstruye una sesión tras recargar o cerrar la pestaña. */
export interface PersistedCardioSession {
  state: 'tracking' | 'paused'
  activityType: CardioActivityType
  startTime: number
  pausedDuration: number
  pauseStart: number | null
  points: GpsPoint[]
  distance: number
  lastSplitKm: number
  lastSplitTime: number
  maxSpeed: number
}

// Se descarta lo persistido hace más de 24 h: restaurar una sesión de hace días
// dejaría corriendo un cronómetro que arrancó en el pasado.
const MAX_SESSION_AGE_MS = 24 * 60 * 60 * 1000

const SNAPSHOT_INTERVAL_MS = 5000

interface Options {
  /** La sesión está viva ('tracking' o 'paused'). */
  active: boolean
  /** Snapshot actual, o null si no hay nada que guardar. */
  buildSnapshot: () => PersistedCardioSession | null
}

export interface CardioPersistence {
  /** Guarda ahora mismo (además del intervalo periódico). */
  persist: () => void
  load: () => PersistedCardioSession | null
  clear: () => void
}

/**
 * Copia de seguridad de la sesión de cardio en `localStorage`: un snapshot cada
 * 5 s mientras la sesión vive, otro al ocultar la pestaña, y la carga con
 * descarte por antigüedad al montar.
 */
export function useCardioPersistence({ active, buildSnapshot }: Options): CardioPersistence {
  // `buildSnapshot` es una closure nueva en cada render; se guarda en un ref
  // para que el intervalo no se reinicie cada vez.
  const buildRef = useRef(buildSnapshot)
  buildRef.current = buildSnapshot

  const persist = useCallback(() => {
    const data = buildRef.current()
    if (!data) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch { /* cuota agotada — ignorar */ }
  }, [])

  const load = useCallback((): PersistedCardioSession | null => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return null
      const data: PersistedCardioSession = JSON.parse(raw)
      if (Date.now() - data.startTime > MAX_SESSION_AGE_MS) {
        localStorage.removeItem(STORAGE_KEY)
        return null
      }
      return data
    } catch {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
  }, [])

  const clear = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  useEffect(() => {
    if (!active) return
    const id = setInterval(persist, SNAPSHOT_INTERVAL_MS)
    return () => clearInterval(id)
  }, [active, persist])

  // Al ocultar la pestaña el navegador puede congelar el JS sin avisar.
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'hidden') persist()
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [persist])

  return { persist, load, clear }
}
