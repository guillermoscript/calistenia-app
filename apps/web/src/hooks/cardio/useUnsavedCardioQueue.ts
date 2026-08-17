import { useCallback, useEffect, useRef, useState } from 'react'
import { pb } from '@calistenia/core/lib/pocketbase'
import { CARDIO_UNSAVED_KEY as UNSAVED_KEY } from '@calistenia/core/lib/storage-keys'
import { saveCardioRoute, splitRoute } from '@calistenia/core/lib/cardioRoutes'

// Cola FIFO acotada: si el backend lleva caído varias sesiones, se prefiere
// perder las más viejas antes que reventar la cuota de localStorage.
const MAX_UNSAVED = 5

function readQueue(): Record<string, unknown>[] {
  try {
    const raw = localStorage.getItem(UNSAVED_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function writeQueue(queue: Record<string, unknown>[]) {
  try {
    localStorage.setItem(UNSAVED_KEY, JSON.stringify(queue))
  } catch { /* cuota agotada */ }
}

function dropQueue() {
  localStorage.removeItem(UNSAVED_KEY)
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
 * Se vacía al montar, al recuperar conexión y al volver a la pestaña.
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
        try {
          // La cola guarda la sesión entera, ruta incluida: se parte aquí para
          // que una entrada encolada antes de #299 también funcione.
          const { record, points: routePoints } = splitRoute(session)
          const saved = await pb.collection('cardio_sessions').create(record)
          await saveCardioRoute(saved.id, userId, routePoints)
        } catch {
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

    const onOnline = () => void flush()
    const onVisible = () => { if (!document.hidden) void flush() }

    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [flush])

  return { unsavedCount, enqueue, flush }
}
