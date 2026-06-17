import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  enqueue,
  getQueue,
  clearQueue,
  cancelQueuedByTempId,
  patchQueuedByTempId,
  persistOrQueue,
  processQueue,
} from './offlineQueue'

// — storage en memoria + connectivity controlable —
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

// — PocketBase falso con respuestas por colección configurables —
type Resp = { ok: true; rec?: any } | { ok: false; status: number }
let responses: Record<string, Resp> = {}
const calls: Array<{ collection: string; action: string; arg: any }> = []

function makePb() {
  const handle = (collection: string, action: string) => async (arg: any) => {
    calls.push({ collection, action, arg })
    const r = responses[collection] ?? { ok: true }
    if (!r.ok) {
      const err: any = new Error(`status ${r.status}`)
      err.status = r.status
      throw err
    }
    return r.rec ?? { id: `srv_${collection}` }
  }
  return {
    collection: (name: string) => ({
      create: handle(name, 'create'),
      update: (id: string, data: any) => handle(name, 'update')({ id, data }),
      delete: (id: string) => handle(name, 'delete')({ id }),
    }),
  } as any
}

beforeEach(() => {
  mem.clear()
  online = true
  responses = {}
  calls.length = 0
  reportError.mockClear()
})

describe('enqueue / getQueue / cancel / patch', () => {
  it('encola y lee', () => {
    enqueue({ collection: 'water_entries', action: 'create', data: { amount_ml: 250 }, tempId: 'local_1' })
    const q = getQueue()
    expect(q).toHaveLength(1)
    expect(q[0]).toMatchObject({ collection: 'water_entries', action: 'create', tempId: 'local_1' })
    expect(q[0].id).toBeTruthy()
  })

  it('cancelQueuedByTempId quita el create pendiente', () => {
    enqueue({ collection: 'water_entries', action: 'create', data: {}, tempId: 'local_1' })
    enqueue({ collection: 'water_entries', action: 'create', data: {}, tempId: 'local_2' })
    expect(cancelQueuedByTempId('local_1')).toBe(true)
    expect(getQueue().map(a => a.tempId)).toEqual(['local_2'])
    expect(cancelQueuedByTempId('nope')).toBe(false)
  })

  it('patchQueuedByTempId fusiona data del create encolado', () => {
    enqueue({ collection: 'sleep_entries', action: 'create', data: { hours: 7 }, tempId: 'local_1' })
    expect(patchQueuedByTempId('local_1', { hours: 8 })).toBe(true)
    expect(getQueue()[0].data).toEqual({ hours: 8 })
  })

  it('clearQueue vacía', () => {
    enqueue({ collection: 'x', action: 'create', data: {} })
    clearQueue()
    expect(getQueue()).toEqual([])
  })
})

describe('persistOrQueue', () => {
  it('online: ejecuta el create y devuelve el record sin encolar', async () => {
    const pb = makePb()
    responses.water_entries = { ok: true, rec: { id: 'srv_1' } }
    const rec = await persistOrQueue(pb, { collection: 'water_entries', action: 'create', data: { amount_ml: 250 }, tempId: 'local_1' })
    expect(rec).toEqual({ id: 'srv_1' })
    expect(getQueue()).toHaveLength(0)
    expect(calls).toHaveLength(1)
  })

  it('offline: NO llama a PB, encola y devuelve null', async () => {
    online = false
    const pb = makePb()
    const rec = await persistOrQueue(pb, { collection: 'water_entries', action: 'create', data: { amount_ml: 250 }, tempId: 'local_1' })
    expect(rec).toBeNull()
    expect(calls).toHaveLength(0)
    expect(getQueue()).toHaveLength(1)
  })

  it('online pero error de red (status 0): encola y devuelve null', async () => {
    const pb = makePb()
    responses.water_entries = { ok: false, status: 0 }
    const rec = await persistOrQueue(pb, { collection: 'water_entries', action: 'create', data: {}, tempId: 'local_1' })
    expect(rec).toBeNull()
    expect(getQueue()).toHaveLength(1)
  })

  it('online con 4xx determinista: relanza y NO encola (lo revierte onError)', async () => {
    const pb = makePb()
    responses.water_entries = { ok: false, status: 400 }
    await expect(
      persistOrQueue(pb, { collection: 'water_entries', action: 'create', data: {} }),
    ).rejects.toMatchObject({ status: 400 })
    expect(getQueue()).toHaveLength(0)
  })
})

describe('processQueue', () => {
  it('vacía la cola y devuelve true al sincronizar con éxito', async () => {
    enqueue({ collection: 'water_entries', action: 'create', data: { amount_ml: 250 } })
    enqueue({ collection: 'water_entries', action: 'delete', recordId: 'srv_9' })
    const pb = makePb()
    const did = await processQueue(pb)
    expect(did).toBe(true)
    expect(getQueue()).toHaveLength(0)
    expect(calls.map(c => c.action)).toEqual(['create', 'delete'])
  })

  it('conserva items que fallan por red (status 0)', async () => {
    enqueue({ collection: 'water_entries', action: 'create', data: {} })
    const pb = makePb()
    responses.water_entries = { ok: false, status: 0 }
    const did = await processQueue(pb)
    expect(did).toBe(false)
    expect(getQueue()).toHaveLength(1) // sigue encolado para el próximo intento
  })

  it('descarta items "poison" 4xx y reporta el error', async () => {
    enqueue({ collection: 'water_entries', action: 'create', data: {} })
    const pb = makePb()
    responses.water_entries = { ok: false, status: 400 }
    await processQueue(pb)
    expect(getQueue()).toHaveLength(0) // no se reintenta para siempre
    expect(reportError).toHaveBeenCalledTimes(1)
  })

  it('cola vacía → no-op, devuelve false', async () => {
    const pb = makePb()
    expect(await processQueue(pb)).toBe(false)
  })
})
