/**
 * Doble de `pb` que reproduce la auto-cancelación del SDK de PocketBase (#536).
 *
 * Es la pieza que faltaba para poder testear el bug: los tests de core usan
 * writers de mentira, y la auto-cancelación **solo existe en el `pb` real**, así
 * que un guardado que perdía 27 de 28 escrituras pasaba las suites en verde.
 *
 * Se emula solo lo que decide el resultado, tomado de `Client.initSendOptions`:
 *
 *   - la clave de cancelación es `requestKey ?? MÉTODO + ruta`, de modo que
 *     **todos los `create` de una colección comparten clave** (misma ruta) y los
 *     `update`/`delete` no (la ruta lleva el id);
 *   - registrar una petición aborta *sincrónicamente* la anterior que tenga esa
 *     clave, y la abortada rechaza con `status: 0` y cuerpo vacío;
 *   - `requestKey: null` (y el alias antiguo `$autoCancel: false`) desactivan
 *     todo el mecanismo.
 *
 * El trabajo de cada petición se resuelve en un turno posterior del event loop
 * para que todas las llamadas de un mismo `Promise.all` se registren antes de
 * que ninguna termine — la condición exacta en la que se perdían.
 */

export type StubRow = Record<string, unknown> & { id: string }

export interface StubWrite {
  op: 'create' | 'update' | 'delete'
  collection: string
  options: unknown
  /**
   * Cuerpo de la escritura, tal cual se pasó. Es `FormData` en las subidas de
   * ficheros (#618) y un objeto plano en el resto; los tests que solo miran
   * `op`/`collection` pueden ignorarlo.
   */
  data?: unknown
  /** Id del registro en `update` y `delete`; ausente en `create`. */
  id?: string
}

export interface PbAutoCancelStub {
  /** Filas por colección, tal como quedarían en la base de datos. */
  rows: Record<string, StubRow[]>
  /** Una entrada por escritura intentada, con las opciones que se pasaron. */
  writes: StubWrite[]
  /** Claves de las peticiones que el emulador abortó. Vacío = nada se perdió. */
  aborted: string[]
  /** Lo que se inyecta como `pb.collection`. */
  collection: (name: string) => Record<string, (...args: any[]) => Promise<any>>
  reset: () => void
}

export function createPbAutoCancelStub(): PbAutoCancelStub {
  const stub: PbAutoCancelStub = {
    rows: {},
    writes: [],
    aborted: [],
    collection: (name: string) => makeCollection(name),
    reset() {
      stub.rows = {}
      stub.writes = []
      stub.aborted = []
      inflight.clear()
      seq = 0
    },
  }

  /** Petición en vuelo por clave de cancelación → callback que la aborta. */
  const inflight = new Map<string, () => void>()
  let seq = 0

  /** Error de aborto con la forma real del SDK: `status: 0` y cuerpo vacío. */
  function autoCancelError(key: string) {
    return Object.assign(new Error('The request was aborted (most likely autocancelled).'), {
      status: 0,
      isAbort: true,
      response: {},
      data: {},
      cancelKey: key,
    })
  }

  function keyFor(method: string, path: string, options?: any): string | null {
    if (options?.requestKey === null || options?.$autoCancel === false) return null
    return options?.requestKey ?? method + path
  }

  function send<T>(method: string, path: string, options: any, work: () => T): Promise<T> {
    const key = keyFor(method, path, options)
    return new Promise<T>((resolve, reject) => {
      let aborted = false
      if (key !== null) {
        inflight.get(key)?.()
        inflight.set(key, () => {
          aborted = true
          stub.aborted.push(key)
          reject(autoCancelError(key))
        })
      }
      setTimeout(() => {
        if (aborted) return
        if (key !== null) inflight.delete(key)
        resolve(work())
      }, 0)
    })
  }

  function makeCollection(name: string) {
    const path = `/api/collections/${name}/records`
    const rows = () => (stub.rows[name] ??= [])
    return {
      create: (data: Record<string, unknown>, options?: any) => {
        stub.writes.push({ op: 'create', collection: name, options, data })
        return send('POST', path, options, () => {
          const rec = { ...data, id: `${name}_${++seq}` } as StubRow
          rows().push(rec)
          return rec
        })
      },
      update: (id: string, data: Record<string, unknown>, options?: any) => {
        stub.writes.push({ op: 'update', collection: name, options, data, id })
        return send('PATCH', `${path}/${id}`, options, () => {
          const rec = rows().find(r => r.id === id)
          if (rec) Object.assign(rec, data)
          return rec ?? ({ id } as StubRow)
        })
      },
      delete: (id: string, options?: any) => {
        stub.writes.push({ op: 'delete', collection: name, options, id })
        return send('DELETE', `${path}/${id}`, options, () => {
          stub.rows[name] = rows().filter(r => r.id !== id)
          return true
        })
      },
      getFullList: (options?: any) => send('GET', path, options, () => [...rows()]),
      getList: (_page?: number, _perPage?: number, options?: any) =>
        send('GET', path, options, () => ({ items: [...rows()], totalItems: rows().length })),
      getOne: (id: string, options?: any) =>
        send('GET', `${path}/${id}`, options, () => rows().find(r => r.id === id)),
      getFirstListItem: (_filter?: string, options?: any) =>
        send('GET', path, options, () => {
          const first = rows()[0]
          if (!first) throw Object.assign(new Error("The requested resource wasn't found."), { status: 404 })
          return first
        }),
    }
  }

  return stub
}
