import type PocketBase from 'pocketbase'

const LS_KEY = 'calistenia_offline_queue'

export interface QueuedAction {
  id: string
  collection: string
  action: 'create' | 'update' | 'delete'
  recordId?: string
  data: any
  timestamp: number
}

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function enqueue(action: Omit<QueuedAction, 'id' | 'timestamp'>): void {
  const queue = getQueue()
  queue.push({
    ...action,
    id: generateId(),
    timestamp: Date.now(),
  })
  localStorage.setItem(LS_KEY, JSON.stringify(queue))
}

export function getQueue(): QueuedAction[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]')
  } catch {
    return []
  }
}

export async function processQueue(pb: PocketBase): Promise<void> {
  const queue = getQueue()
  if (queue.length === 0) return

  const remaining: QueuedAction[] = []

  for (const item of queue) {
    try {
      switch (item.action) {
        case 'create':
          await pb.collection(item.collection).create(item.data)
          break
        case 'update':
          if (item.recordId) {
            await pb.collection(item.collection).update(item.recordId, item.data)
          }
          break
        case 'delete':
          if (item.recordId) {
            await pb.collection(item.collection).delete(item.recordId)
          }
          break
      }
    } catch (e) {
      console.warn(`[offlineQueue] Failed to process action ${item.id}:`, e)
      remaining.push(item)
    }
  }

  localStorage.setItem(LS_KEY, JSON.stringify(remaining))
}

export function clearQueue(): void {
  localStorage.removeItem(LS_KEY)
}

export function setupAutoSync(pb: PocketBase): () => void {
  const handler = () => {
    processQueue(pb).catch((e) =>
      console.warn('[offlineQueue] Auto-sync failed:', e)
    )
  }

  window.addEventListener('online', handler)

  // Also process any pending items right now if we're online
  if (navigator.onLine) {
    handler()
  }

  return () => {
    window.removeEventListener('online', handler)
  }
}
