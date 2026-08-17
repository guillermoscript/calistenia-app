import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { pb } from '@calistenia/core/lib/pocketbase'
import { CARDIO_UNSAVED_KEY as UNSAVED_KEY } from '@calistenia/core/lib/storage-keys'
import { saveCardioRoute, splitRoute } from '@calistenia/core/lib/cardioRoutes'

import { syncStorage } from '@/lib/storage'
import { onOnline } from '@/lib/connectivity'
import { Sentry } from '@/lib/instrument'

// Cola FIFO acotada: si el backend lleva caído varias sesiones, se prefiere
// perder las más viejas antes que llenar el almacenamiento.
const MAX_UNSAVED = 5

function readQueue(): Record<string, unknown>[] {
  try {
    const raw = syncStorage.getItem(UNSAVED_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function writeQueue(queue: Record<string, unknown>[]) {
  try {
    syncStorage.setItem(UNSAVED_KEY, JSON.stringify(queue))
  } catch { /* ignorar */ }
}

function dropQueue() {
  syncStorage.removeItem(UNSAVED_KEY)
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
 *
 * Se vacía al montar, al volver a primer plano y al recuperar conexión. NetInfo
 * no se entera de que el PB de desarrollo (`adb reverse`) se cae al desenchufar
 * el USB, así que el reintento al volver a foreground es el que salva ese caso.
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
        } catch (e) {
          Sentry.captureException(e, { tags: { feature: 'cardio', op: 'flush_unsaved_session' } })
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

    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void flush()
    })
    const offOnline = onOnline(() => void flush())
    return () => {
      appStateSub.remove()
      offOnline()
    }
  }, [flush])

  return { unsavedCount, enqueue, flush }
}
