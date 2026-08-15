import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  enqueue,
  getQueue,
  clearQueue,
  cancelQueuedByTempId,
  cancelLastQueuedByTempId,
  getPendingCreates,
  isAlreadyPersistedError,
  newClientId,
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
      if (r.body) err.response = r.body // el SDK expone ahí el cuerpo del 400
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

  // #301: repetir el mismo entreno el mismo día encola DOS sesiones bajo la
  // misma clave `done_<fecha>_<workoutKey>`. Deshacer una vez debe quitar una.
  it('cancelLastQueuedByTempId quita solo el último que casa', () => {
    enqueue({ collection: 'sessions', action: 'create', data: { n: 1 }, tempId: 'done_2026-08-15_p1_lun' })
    enqueue({ collection: 'sessions', action: 'create', data: { n: 2 }, tempId: 'done_2026-08-15_p1_lun' })
    expect(cancelLastQueuedByTempId('done_2026-08-15_p1_lun')).toBe(true)
    const q = getQueue()
    expect(q).toHaveLength(1)
    expect(q[0].data).toEqual({ n: 1 }) // se fue el segundo, no el primero
    expect(cancelLastQueuedByTempId('nope')).toBe(false)
  })

  it('getPendingCreates filtra por colección, ignora update/delete y conserva el orden', () => {
    enqueue({ collection: 'sets_log', action: 'create', data: { reps: '8' } })
    enqueue({ collection: 'sessions', action: 'create', data: { workout_key: 'p1_lun' } })
    enqueue({ collection: 'sets_log', action: 'create', data: { reps: '10' } })
    enqueue({ collection: 'sets_log', action: 'delete', recordId: 'srv_1' })
    expect(getPendingCreates('sets_log')).toEqual([{ reps: '8' }, { reps: '10' }])
    expect(getPendingCreates('sessions')).toEqual([{ workout_key: 'p1_lun' }])
    expect(getPendingCreates('water_entries')).toEqual([])
  })

  it('newClientId no se repite entre llamadas', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newClientId()))
    expect(ids.size).toBe(500)
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

describe('isAlreadyPersistedError', () => {
  const notUnique = (over: any = {}) => ({
    status: 400,
    response: { data: { client_id: { code: 'validation_not_unique' } } },
    ...over,
  })

  it('reconoce el 400 de índice único', () => {
    expect(isAlreadyPersistedError(notUnique())).toBe(true)
  })

  it('lo reconoce también cuando el SDK expone el cuerpo en `.data`', () => {
    expect(isAlreadyPersistedError({
      status: 400,
      data: { data: { client_id: { code: 'validation_not_unique' } } },
    })).toBe(true)
  })

  it('no confunde otros 400 de validación', () => {
    expect(isAlreadyPersistedError(notUnique({
      response: { data: { phase: { code: 'validation_required' } } },
    }))).toBe(false)
  })

  it('no confunde un error de red ni un 403', () => {
    expect(isAlreadyPersistedError({ status: 0 })).toBe(false)
    expect(isAlreadyPersistedError(notUnique({ status: 403 }))).toBe(false)
    expect(isAlreadyPersistedError(new Error('boom'))).toBe(false)
    expect(isAlreadyPersistedError(null)).toBe(false)
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

  // #301: la ventana ciega. `status: 0` significa «no hubo respuesta», no «no
  // llegó»: el create pudo procesarse entero y perderse solo la respuesta. El
  // índice único sobre (user, client_id) rechaza entonces el replay con
  // `validation_not_unique`, que NO es un fallo sino la prueba de que el dato
  // está a salvo.
  it('un replay que choca con el índice único se descarta SIN reportar y cuenta como procesado', async () => {
    enqueue({ collection: 'sets_log', action: 'create', data: { reps: '8', client_id: 'abc' } })
    const pb = makePb()
    responses.sets_log = {
      ok: false,
      status: 400,
      body: { data: { client_id: { code: 'validation_not_unique', message: 'Value must be unique.' } } },
    }
    const did = await processQueue(pb)
    expect(did).toBe(true) // dispara onDrained → la app refresca contra el registro real
    expect(getQueue()).toHaveLength(0) // no se reintenta para siempre
    expect(reportError).not.toHaveBeenCalled() // no es un error que nadie deba mirar
  })

  it('un 400 de validación normal sigue siendo poison y SÍ se reporta', async () => {
    enqueue({ collection: 'sets_log', action: 'create', data: { reps: '8' } })
    const pb = makePb()
    responses.sets_log = {
      ok: false,
      status: 400,
      body: { data: { reps: { code: 'validation_required', message: 'Missing required value.' } } },
    }
    const did = await processQueue(pb)
    expect(did).toBe(false)
    expect(getQueue()).toHaveLength(0)
    expect(reportError).toHaveBeenCalledTimes(1)
  })

  it('cola vacía → no-op, devuelve false', async () => {
    const pb = makePb()
    expect(await processQueue(pb)).toBe(false)
  })

  it('sin sesión válida NO drena: conserva la cola (evita descartes 400 sin auth)', async () => {
    enqueue({ collection: 'water_entries', action: 'create', data: { amount_ml: 500 } })
    const pb = makePb({ authed: false })
    const did = await processQueue(pb)
    expect(did).toBe(false)
    expect(calls).toHaveLength(0) // ni siquiera intenta el replay
    expect(getQueue()).toHaveLength(1) // sigue ahí para después del login
  })

  it('drenados concurrentes comparten una sola pasada (sin replays duplicados)', async () => {
    enqueue({ collection: 'water_entries', action: 'create', data: { amount_ml: 350 } })
    const pb = makePb()
    // StrictMode / boot + evento online: dos llamadas sin await intermedio.
    const [a, b] = await Promise.all([processQueue(pb), processQueue(pb)])
    expect(a).toBe(true)
    expect(b).toBe(true) // misma promesa compartida
    expect(calls.filter(c => c.action === 'create')).toHaveLength(1) // UN solo create en PB
    expect(getQueue()).toHaveLength(0)
  })
})
