import { useCallback, useEffect, useRef, useState } from 'react'
import { pb } from '../../lib/pocketbase'
import { storage, lifecycle, getPlatform } from '../../platform'
import { CARDIO_UNSAVED_KEY as UNSAVED_KEY } from '../../lib/storage-keys'
import { saveCardioRoute, splitRoute } from '../../lib/cardioRoutes'
import { isCardioSessionTooShort } from '../../lib/cardioMinimum'

// Cola FIFO acotada: si el backend lleva caído varias sesiones, se prefiere
// perder las más viejas antes que llenar el almacenamiento.
const MAX_UNSAVED = 5

function readQueue(): Record<string, unknown>[] {
  try {
    const raw = storage.getItem(UNSAVED_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function writeQueue(queue: Record<string, unknown>[]) {
  try {
    storage.setItem(UNSAVED_KEY, JSON.stringify(queue))
  } catch { /* almacenamiento lleno — ignorar */ }
}

function dropQueue() {
  storage.removeItem(UNSAVED_KEY)
}

interface Options {
  userId: string | null
  /** Se llama cuando al menos una sesión encolada llegó a PocketBase. */
  onFlushed?: () => void
}

export interface UnsavedCardioQueue {
  unsavedCount: number
  /** Guarda una sesión que PocketBase rechazó, para reintentarla luego. */
  enqueue: (session: Record<string, unknown>) => void
  flush: () => Promise<void>
}

/**
 * Cola de reintento de las sesiones de cardio que no se pudieron guardar.
 * Se vacía al montar, al volver a primer plano y al recuperar conexión. En
 * móvil el reintento al volver a foreground salva el caso del PB de desarrollo
 * (`adb reverse`) que NetInfo no detecta al desenchufar el USB.
 */
export function useUnsavedCardioQueue({ userId, onFlushed }: Options): UnsavedCardioQueue {
  const [unsavedCount, setUnsavedCount] = useState(0)
  const flushingRef = useRef(false)
  const onFlushedRef = useRef(onFlushed)
  onFlushedRef.current = onFlushed

  const enqueue = useCallback((session: Record<string, unknown>) => {
    const queue = readQueue()
    queue.push(session)
    while (queue.length > MAX_UNSAVED) queue.shift()
    writeQueue(queue)
    setUnsavedCount(readQueue().length)
  }, [])

  const flush = useCallback(async () => {
    if (!userId || flushingRef.current) return
    const queue = readQueue()
    setUnsavedCount(queue.length)
    if (queue.length === 0) return
    flushingRef.current = true
    try {
      const remaining: Record<string, unknown>[] = []
      for (const session of queue) {
        // Una sesión accidental (#562) encolada antes de este umbral se tira
        // en vez de reintentarse para siempre.
        if (isCardioSessionTooShort(session)) continue
        try {
          // La cola guarda la sesión entera, ruta incluida: se parte aquí para
          // que una entrada encolada antes de #299 también funcione.
          const { record, points: routePoints } = splitRoute(session)
          const saved = await pb.collection('cardio_sessions').create(record)
          await saveCardioRoute(saved.id, userId, routePoints)
        } catch (e) {
          getPlatform().reportError?.(e)
          remaining.push(session)
        }
      }
      if (remaining.length > 0) writeQueue(remaining)
      else dropQueue()
      setUnsavedCount(remaining.length)
      if (remaining.length < queue.length) onFlushedRef.current?.()
    } finally {
      flushingRef.current = false
    }
  }, [userId])

  useEffect(() => {
    void flush()

    const offForeground = lifecycle.onForeground(() => void flush())
    const offOnline = getPlatform().connectivity.onOnline(() => void flush())
    return () => {
      offForeground()
      offOnline()
    }
  }, [flush])

  return { unsavedCount, enqueue, flush }
}
