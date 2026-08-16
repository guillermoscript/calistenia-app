import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  CIRCUIT_COLLECTION,
  LEGACY_CIRCUIT_UNSAVED_KEY,
  countQueuedCircuitSessions,
  migrateLegacyCircuitQueue,
} from './circuitSessionQueue'
import { clearQueue, enqueue, getQueue, persistOrQueue, processQueue } from './offlineQueue'

// — storage en memoria + connectivity controlable (mismo patrón que offlineQueue.test) —
const mem = new Map<string, string>()
let online = true
const reportError = vi.fn()

vi.mock('../platform', () => ({
  storage: {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => { mem.set(k, v) },
    removeItem: (k: string) => { mem.delete(k) },
  },
  getPlatform: () => ({
    connectivity: { isOnline: () => online, onOnline: () => () => {}, onChange: () => () => {} },
    reportError,
  }),
}))

type Resp = { ok: true; rec?: any } | { ok: false; status: number; body?: any }
let responses: Record<string, Resp> = {}
const calls: Array<{ collection: string; action: string; arg: any }> = []

function makePb({ authed = true }: { authed?: boolean } = {}) {
  const handle = (collection: string, action: string) => async (arg: any) => {
    calls.push({ collection, action, arg })
    const r = responses[collection] ?? { ok: true }
    if (!r.ok) {
      const err: any = new Error(`status ${r.status}`)
      err.status = r.status
      if (r.body) err.response = r.body
      throw err
    }
    return r.rec ?? { id: `srv_${collection}` }
  }
  return {
    authStore: { isValid: authed },
    collection: (name: string) => ({
      create: handle(name, 'create'),
      update: (id: string, data: any) => handle(name, 'update')({ id, data }),
      delete: (id: string) => handle(name, 'delete')({ id }),
    }),
  } as any
}

const SESSION = { user: 'u1', circuit_name: 'Tabata', rounds_completed: 4, client_id: 'cid_1' }

beforeEach(() => {
  mem.clear()
  clearQueue()
  online = true
  responses = {}
  calls.length = 0
  reportError.mockClear()
})

describe('completar un circuito por la cola offline (#464)', () => {
  it('sin red la sesión se encola con su client_id, no se pierde', async () => {
    online = false
    const pb = makePb()

    const rec = await persistOrQueue(pb, { collection: CIRCUIT_COLLECTION, action: 'create', data: SESSION })

    expect(rec).toBeNull() // encolada → el llamador marca `saved: false`
    expect(calls).toHaveLength(0) // ni se intentó, no había red
    const queued = getQueue()
    expect(queued).toHaveLength(1)
    expect(queued[0].collection).toBe(CIRCUIT_COLLECTION)
    expect(queued[0].data.client_id).toBe('cid_1')
  })

  it('un `status: 0` a mitad de la petición encola en vez de perder la sesión', async () => {
    responses[CIRCUIT_COLLECTION] = { ok: false, status: 0 }
    const pb = makePb()

    const rec = await persistOrQueue(pb, { collection: CIRCUIT_COLLECTION, action: 'create', data: SESSION })

    expect(rec).toBeNull()
    expect(getQueue()).toHaveLength(1)
  })

  it('el replay de una sesión que SÍ había llegado no la duplica', async () => {
    // La petición original se perdió con `status: 0` pero el servidor la
    // procesó. Al reintentar, el índice único parcial (user, client_id) la
    // rechaza con `validation_not_unique`: eso es «ya está», no un fallo.
    enqueue({ collection: CIRCUIT_COLLECTION, action: 'create', data: SESSION })
    responses[CIRCUIT_COLLECTION] = {
      ok: false,
      status: 400,
      body: { data: { client_id: { code: 'validation_not_unique', message: 'Value must be unique.' } } },
    }
    const pb = makePb()

    const processed = await processQueue(pb)

    expect(processed).toBe(true) // cuenta como procesada → la app refresca
    expect(getQueue()).toHaveLength(0) // se descarta, no se reintenta para siempre
    expect(reportError).not.toHaveBeenCalled() // y sin ruido: no es un error
  })

  it('un 4xx determinista no se encola: lo revierte/reporta el llamador', async () => {
    responses[CIRCUIT_COLLECTION] = { ok: false, status: 400 }
    const pb = makePb()

    await expect(
      persistOrQueue(pb, { collection: CIRCUIT_COLLECTION, action: 'create', data: SESSION }),
    ).rejects.toThrow()
    expect(getQueue()).toHaveLength(0)
  })

  it('la sesión encolada se sube al reconectar', async () => {
    online = false
    const pb = makePb()
    await persistOrQueue(pb, { collection: CIRCUIT_COLLECTION, action: 'create', data: SESSION })

    online = true
    const processed = await processQueue(pb)

    expect(processed).toBe(true)
    expect(calls.filter(c => c.collection === CIRCUIT_COLLECTION)).toHaveLength(1) // UNA sola vez
    expect(getQueue()).toHaveLength(0)
  })
})

describe('countQueuedCircuitSessions', () => {
  it('cuenta solo circuitos, no el resto de la cola', () => {
    enqueue({ collection: CIRCUIT_COLLECTION, action: 'create', data: SESSION })
    enqueue({ collection: CIRCUIT_COLLECTION, action: 'create', data: SESSION })
    enqueue({ collection: 'sets_log', action: 'create', data: {} })

    expect(countQueuedCircuitSessions()).toBe(2)
  })

  it('cero con la cola vacía', () => {
    expect(countQueuedCircuitSessions()).toBe(0)
  })
})

describe('migrateLegacyCircuitQueue', () => {
  it('trasvasa la cola casera anterior y borra la clave vieja', () => {
    mem.set(LEGACY_CIRCUIT_UNSAVED_KEY, JSON.stringify([{ user: 'u1', circuit_name: 'A' }, { user: 'u1', circuit_name: 'B' }]))

    const migrated = migrateLegacyCircuitQueue()

    expect(migrated).toBe(2)
    expect(mem.has(LEGACY_CIRCUIT_UNSAVED_KEY)).toBe(false)
    const queued = getQueue()
    expect(queued).toHaveLength(2)
    expect(queued.every(a => a.collection === CIRCUIT_COLLECTION && a.action === 'create')).toBe(true)
  })

  it('genera client_id a las sesiones viejas (no lo tenían) y respeta el que ya venga', () => {
    mem.set(LEGACY_CIRCUIT_UNSAVED_KEY, JSON.stringify([{ circuit_name: 'A' }, { circuit_name: 'B', client_id: 'ya_tenia' }]))

    migrateLegacyCircuitQueue()

    const [a, b] = getQueue()
    expect(a.data.client_id).toBeTruthy()
    expect(b.data.client_id).toBe('ya_tenia')
    expect(a.data.client_id).not.toBe(b.data.client_id)
  })

  it('sin cola vieja no hace nada', () => {
    expect(migrateLegacyCircuitQueue()).toBe(0)
    expect(getQueue()).toHaveLength(0)
  })

  it('con contenido corrupto limpia la clave en vez de reintentar el parseo cada arranque', () => {
    mem.set(LEGACY_CIRCUIT_UNSAVED_KEY, '{no es json')

    expect(migrateLegacyCircuitQueue()).toBe(0)
    expect(mem.has(LEGACY_CIRCUIT_UNSAVED_KEY)).toBe(false)
    expect(getQueue()).toHaveLength(0)
  })
})
