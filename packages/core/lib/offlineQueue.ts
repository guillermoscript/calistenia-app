import { storage, getPlatform } from '../platform'
import type PocketBase from 'pocketbase'

const LS_KEY = 'calistenia_offline_queue'

export interface QueuedAction {
  id: string
  collection: string
  action: 'create' | 'update' | 'delete'
  recordId?: string
  data?: any
  /**
   * Id temporal (`local_…`) del registro optimista que originó este create.
   * Permite cancelar/parchear el create encolado si el usuario borra o edita
   * el registro ANTES de que se sincronice (todavía offline).
   */
  tempId?: string
  timestamp: number
}

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function setQueue(queue: QueuedAction[]): void {
  storage.setItem(LS_KEY, JSON.stringify(queue))
}

export function getQueue(): QueuedAction[] {
  try {
    return JSON.parse(storage.getItem(LS_KEY) || '[]')
  } catch {
    return []
  }
}

/** Encola una acción durable. Devuelve el id interno de la cola. */
export function enqueue(action: Omit<QueuedAction, 'id' | 'timestamp'>): string {
  const queue = getQueue()
  const id = generateId()
  queue.push({ ...action, id, timestamp: Date.now() })
  setQueue(queue)
  return id
}

/**
 * Cancela un create pendiente por su tempId (p.ej. el usuario borró offline un
 * registro aún no sincronizado). Devuelve true si quitó algo de la cola.
 */
export function cancelQueuedByTempId(tempId: string): boolean {
  const queue = getQueue()
  const next = queue.filter(a => a.tempId !== tempId)
  if (next.length === queue.length) return false
  setQueue(next)
  return true
}

/**
 * Aplica un patch al `data` de un create pendiente (el usuario editó offline un
 * registro aún no sincronizado). Devuelve true si parcheó algo.
 */
export function patchQueuedByTempId(tempId: string, patch: Record<string, unknown>): boolean {
  const queue = getQueue()
  let changed = false
  for (const a of queue) {
    if (a.tempId === tempId && a.action === 'create') {
      a.data = { ...a.data, ...patch }
      changed = true
    }
  }
  if (changed) setQueue(queue)
  return changed
}

export function clearQueue(): void {
  storage.removeItem(LS_KEY)
}

/**
 * ¿El error es de red (sin respuesta del server) y por tanto procede encolar /
 * reintentar? PocketBase ClientResponseError trae `status: 0` cuando no hubo
 * respuesta (red caída, DNS, timeout). Un 4xx/5xx con status es respuesta del
 * server: determinista, NO se encola (lo revierte onError de la mutación).
 */
function isNetworkError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    const s = (error as { status?: unknown }).status
    return s === 0 || s === undefined
  }
  return true // sin forma de status conocido → tratar como red
}

export interface WriteSpec {
  collection: string
  action: 'create' | 'update' | 'delete'
  recordId?: string
  data?: any
  /** Solo create: liga el create encolado con el id optimista para cancelar/parchear. */
  tempId?: string
}

/**
 * Ejecuta una escritura de PocketBase; si estamos offline o la red falla a mitad
 * de la request, la encola para reintentarla al reconectar (vía setupAutoSync).
 * Devuelve el record (camino online) o `null` (encolado offline → el llamador
 * mantiene su id optimista hasta el refetch que reconcilia con el server).
 *
 * Pensado para usarse DENTRO del mutationFn de una mutación con
 * `networkMode: 'always'` (así el fn corre aunque no haya red, en vez de que
 * React Query la pause — lo que dejaría la escritura solo en memoria y se
 * perdería si el SO mata la app).
 */
export async function persistOrQueue(pb: PocketBase, spec: WriteSpec): Promise<any | null> {
  const { connectivity } = getPlatform()

  const run = async (): Promise<any | null> => {
    switch (spec.action) {
      case 'create':
        return pb.collection(spec.collection).create(spec.data)
      case 'update':
        return pb.collection(spec.collection).update(spec.recordId!, spec.data)
      case 'delete':
        await pb.collection(spec.collection).delete(spec.recordId!)
        return null
    }
  }

  if (!connectivity.isOnline()) {
    enqueue(spec)
    return null
  }
  try {
    return await run()
  } catch (e) {
    if (isNetworkError(e)) {
      enqueue(spec)
      return null
    }
    throw e // 4xx/5xx determinista → que onError revierta el optimista
  }
}

/**
 * Vacía la cola contra PocketBase. Conserva los items que fallen por red (para
 * el próximo intento) y descarta los que fallen con respuesta del server (4xx/5xx
 * "poison" — reintentarlos colgaría la cola para siempre). Devuelve true si
 * procesó al menos un item (para que el llamador invalide queries y reconcilie).
 */
export async function processQueue(pb: PocketBase): Promise<boolean> {
  const queue = getQueue()
  if (queue.length === 0) return false

  const remaining: QueuedAction[] = []
  let processedAny = false

  for (const item of queue) {
    try {
      switch (item.action) {
        case 'create':
          await pb.collection(item.collection).create(item.data)
          processedAny = true
          break
        case 'update':
          if (item.recordId) {
            await pb.collection(item.collection).update(item.recordId, item.data)
            processedAny = true
          }
          break
        case 'delete':
          if (item.recordId) {
            await pb.collection(item.collection).delete(item.recordId)
            processedAny = true
          }
          break
      }
    } catch (e) {
      if (isNetworkError(e)) {
        remaining.push(item) // sigue offline → reintentar luego
      } else {
        // Respuesta del server (validación/permiso/404): no reintentar.
        getPlatform().reportError?.(e)
      }
    }
  }

  setQueue(remaining)
  return processedAny
}

/**
 * Reintenta la cola al reconectar (y una vez ahora si ya hay red). `onDrained`
 * se llama tras vaciar items con éxito — la app lo usa para invalidar queries y
 * reconciliar los ids optimistas con los reales del server.
 */
export function setupAutoSync(pb: PocketBase, onDrained?: () => void): () => void {
  const handler = () => {
    processQueue(pb)
      .then(did => { if (did) onDrained?.() })
      .catch(e => getPlatform().reportError?.(e))
  }

  const { connectivity } = getPlatform()
  const unsubscribe = connectivity.onOnline(handler)

  // Procesar lo pendiente ahora mismo si ya estamos online.
  if (connectivity.isOnline()) handler()

  return unsubscribe
}
