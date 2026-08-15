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

/**
 * Id de deduplicación que viaja DENTRO del payload (`client_id`) y sobrevive a
 * los reintentos de la cola.
 *
 * Sin él, un `status: 0` no se puede interpretar: significa «no hubo respuesta»,
 * no «no llegó». La petición pudo procesarse entera en el servidor y perderse
 * solo la respuesta, así que el reintento crearía una fila duplicada. Con el id
 * fijo, el índice único parcial de `sets_log`/`sessions` rechaza el segundo
 * intento y `isAlreadyPersistedError` lo lee como «ya está», no como fallo.
 */
export function newClientId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
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
 * Cancela SOLO el último create pendiente que casa con `tempId`, en vez de
 * todos como hace `cancelQueuedByTempId`.
 *
 * Repetir el mismo entrenamiento el mismo día encola dos sesiones bajo la misma
 * clave `done_<fecha>_<workoutKey>`: deshacer una vez tiene que quitar una, no
 * las dos. Devuelve true si quitó algo.
 */
export function cancelLastQueuedByTempId(tempId: string): boolean {
  const queue = getQueue()
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].tempId === tempId) {
      queue.splice(i, 1)
      setQueue(queue)
      return true
    }
  }
  return false
}

/**
 * Payloads (`data`) de los `create` pendientes de una colección, en orden de
 * cola. Permite a la app pintar lo que aún no ha llegado al servidor en vez de
 * dejar que una recarga desde PocketBase lo borre de la caché local.
 */
export function getPendingCreates(collection: string): any[] {
  return getQueue()
    .filter(a => a.collection === collection && a.action === 'create' && a.data)
    .map(a => a.data)
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
export function isNetworkError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    const s = (error as { status?: unknown }).status
    return s === 0 || s === undefined
  }
  return true // sin forma de status conocido → tratar como red
}

/**
 * ¿El servidor rechazó el replay porque el registro YA existe?
 *
 * `sets_log` y `sessions` llevan un índice único parcial sobre
 * `(user, client_id)`. Si un create se encoló tras un `status: 0` pero en
 * realidad sí llegó, el reintento choca contra ese índice y PocketBase responde
 * 400 con `validation_not_unique`. Eso NO es un fallo: es la confirmación de que
 * el dato está a salvo. Se descarta de la cola igual que un poison, pero sin
 * reportar el error y contando como procesado, para que `onDrained` invalide las
 * queries y la app reconcilie con el registro real del servidor.
 */
export function isAlreadyPersistedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  if ((error as { status?: unknown }).status !== 400) return false
  // El SDK expone el cuerpo en `.response` y (según versión) también en `.data`.
  const body = (error as any).response ?? (error as any).data
  const fields = body?.data ?? body
  if (!fields || typeof fields !== 'object') return false
  return Object.values(fields).some(
    (v: any) => typeof v?.code === 'string' && v.code.includes('not_unique'),
  )
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
 * Serializa una pasada de drenado entre pestañas (Web Locks). En RN no existe
 * navigator.locks: hay un solo contexto JS, así que el guard en memoria de
 * processQueue basta.
 */
function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const locks = (globalThis as any).navigator?.locks
  if (locks?.request) return locks.request('calistenia_offline_queue', fn)
  return fn()
}

let drainInFlight: Promise<boolean> | null = null

/**
 * Vacía la cola contra PocketBase. Conserva los items que fallen por red (para
 * el próximo intento) y descarta los que fallen con respuesta del server (4xx/5xx
 * "poison" — reintentarlos colgaría la cola para siempre). Devuelve true si
 * procesó al menos un item (para que el llamador invalide queries y reconcilie).
 *
 * Concurrencia: dos drenados simultáneos (StrictMode monta efectos dos veces;
 * boot + evento online; varias pestañas) leerían el mismo snapshot de la cola y
 * replicarían cada create DOS veces en PB. El guard en memoria comparte la
 * pasada dentro del mismo contexto JS y runExclusive serializa entre pestañas.
 */
export function processQueue(pb: PocketBase): Promise<boolean> {
  if (drainInFlight) return drainInFlight
  drainInFlight = runExclusive(() => drainQueue(pb)).finally(() => { drainInFlight = null })
  return drainInFlight
}

async function drainQueue(pb: PocketBase): Promise<boolean> {
  // Sin sesión válida NO se drena: los replays llegarían sin token, PB los
  // rechazaría con 400/403 y el camino "poison" los descartaría para siempre
  // (pérdida de datos). Se conserva la cola hasta que haya login (setupAutoSync
  // drena al recuperar sesión).
  if (!pb.authStore.isValid) return false

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
      } else if (isAlreadyPersistedError(e)) {
        // El create ya había llegado (se perdió su respuesta, no la petición):
        // el índice único lo rechaza. Descartar sin ruido y contar como
        // procesado para que la app refresque contra el registro real.
        processedAny = true
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

  // Drenar también al recuperar sesión: si el arranque fue offline (sin auth)
  // la cola queda retenida; el login posterior es el momento de sincronizarla.
  const unsubAuth = pb.authStore.onChange(() => {
    if (pb.authStore.isValid) handler()
  })

  // Procesar lo pendiente ahora mismo si ya estamos online.
  if (connectivity.isOnline()) handler()

  return () => {
    unsubscribe()
    unsubAuth()
  }
}
