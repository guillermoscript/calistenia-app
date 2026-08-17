import { useCallback, useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import { CARDIO_ACTIVE_KEY as STORAGE_KEY } from '@calistenia/core/lib/storage-keys'
import type { CardioActivityType, GpsPoint } from '@calistenia/core/types'

import { syncStorage } from '@/lib/storage'

/**
 * Snapshot con el que se reconstruye una sesión si Android mata el proceso.
 *
 * A diferencia de la web, aquí viajan también `programId`/`programDayKey`: en
 * nativo la sesión sobrevive a que la app muera del todo, y sin ellos se
 * perdería a qué día de programa pertenecía.
 */
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
  programId: string | null
  programDayKey: string | null
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
 * Copia de seguridad de la sesión de cardio: un snapshot cada 5 s mientras la
 * sesión vive, otro al pasar a segundo plano (el Foreground Service sigue
 * trackeando, pero si Android mata el proceso esto es lo único que queda), y la
 * carga con descarte por antigüedad al montar.
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
      syncStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch { /* ignorar */ }
  }, [])

  const load = useCallback((): PersistedCardioSession | null => {
    try {
      const raw = syncStorage.getItem(STORAGE_KEY)
      if (!raw) return null
      const data: PersistedCardioSession = JSON.parse(raw)
      if (Date.now() - data.startTime > MAX_SESSION_AGE_MS) {
        syncStorage.removeItem(STORAGE_KEY)
        return null
      }
      return data
    } catch {
      syncStorage.removeItem(STORAGE_KEY)
      return null
    }
  }, [])

  const clear = useCallback(() => {
    syncStorage.removeItem(STORAGE_KEY)
  }, [])

  useEffect(() => {
    if (!active) return
    const id = setInterval(persist, SNAPSHOT_INTERVAL_MS)
    return () => clearInterval(id)
  }, [active, persist])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') persist()
    })
    return () => sub.remove()
  }, [persist])

  return { persist, load, clear }
}
