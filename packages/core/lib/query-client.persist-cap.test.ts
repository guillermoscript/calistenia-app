/**
 * Guard de tamaño del caché persistido (#661).
 *
 * El bug: el persister mete TODA la caché de queries en una única clave de
 * AsyncStorage. En Android eso es una fila de SQLite y al pasar de ~2 MB la
 * lectura entera del storage revienta con «Row too big to fit into
 * CursorWindow», tumbando el arranque. El guard impide llegar ahí.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { initCore, type CorePlatform } from '../platform'
import {
  cappedStorage,
  trimPersistedCache,
  PERSIST_KEY,
  PERSIST_MAX_CHARS,
} from './query-client'

let disk: Map<string, string>
let reported: unknown[]

beforeEach(() => {
  disk = new Map()
  reported = []
  initCore({
    storage: {
      getItem: (k) => disk.get(k) ?? null,
      setItem: (k, v) => void disk.set(k, v),
      removeItem: (k) => void disk.delete(k),
    },
    env: { pbUrl: '', aiApiUrl: '', isDev: true },
    analytics: { track: () => {}, identify: () => {}, clear: () => {} },
    connectivity: { isOnline: () => true, onOnline: () => () => {} },
    reportError: (e) => void reported.push(e),
  } as CorePlatform)
})

describe('cappedStorage', () => {
  it('escribe con normalidad un caché por debajo del tope', () => {
    const value = 'x'.repeat(PERSIST_MAX_CHARS)
    cappedStorage.setItem(PERSIST_KEY, value)
    expect(cappedStorage.getItem(PERSIST_KEY)).toBe(value)
    expect(reported).toHaveLength(0)
  })

  it('descarta un caché por encima del tope que no se puede recortar', () => {
    // 'xxx…' no es JSON: no hay queries que recortar, se descarta como antes.
    cappedStorage.setItem(PERSIST_KEY, 'x'.repeat(PERSIST_MAX_CHARS + 1))
    expect(cappedStorage.getItem(PERSIST_KEY)).toBeNull()
  })

  it('borra el caché anterior al descartar: no puede quedar uno rancio en disco', () => {
    cappedStorage.setItem(PERSIST_KEY, 'viejo')
    cappedStorage.setItem(PERSIST_KEY, 'x'.repeat(PERSIST_MAX_CHARS + 1))
    // Si se conservara «viejo» se rehidrataría para siempre: al no volver a
    // escribirse nunca, nada lo sobrescribiría.
    expect(disk.has(PERSIST_KEY)).toBe(false)
  })

  it('reporta el descarte a monitoreo con el tamaño', () => {
    cappedStorage.setItem(PERSIST_KEY, 'x'.repeat(PERSIST_MAX_CHARS + 7))
    expect(reported).toHaveLength(1)
    expect((reported[0] as Error).message).toContain(String(PERSIST_MAX_CHARS + 7))
  })

  it('recorta las queries más grandes en vez de descartar todo el caché', () => {
    // Forma real del persister: { buster, timestamp, clientState: { queries } }.
    const query = (hash: string, data: string) => ({
      queryHash: hash,
      queryKey: [hash],
      state: { data },
    })
    const cache = JSON.stringify({
      buster: 'v-test',
      timestamp: 1,
      clientState: {
        mutations: [],
        queries: [
          query('chica-1', 'a'.repeat(1000)),
          query('gorda', 'b'.repeat(PERSIST_MAX_CHARS)), // ella sola revienta el tope
          query('chica-2', 'c'.repeat(1000)),
        ],
      },
    })
    cappedStorage.setItem(PERSIST_KEY, cache)

    const written = cappedStorage.getItem(PERSIST_KEY)
    expect(written).not.toBeNull()
    expect(written!.length).toBeLessThanOrEqual(PERSIST_MAX_CHARS)
    const hashes = JSON.parse(written!).clientState.queries.map((q: any) => q.queryHash)
    // Sobreviven las pequeñas, en su orden original; cae solo la gorda.
    expect(hashes).toEqual(['chica-1', 'chica-2'])
    // Recortar es comportamiento normal, no un error que reportar.
    expect(reported).toHaveLength(0)
  })

  it('descarta si ni vaciando las queries cabe (p.ej. mutaciones gigantes)', () => {
    const cache = JSON.stringify({
      buster: 'v-test',
      timestamp: 1,
      clientState: {
        mutations: [{ state: { variables: 'm'.repeat(PERSIST_MAX_CHARS + 1000) } }],
        queries: [{ queryHash: 'q', queryKey: ['q'], state: { data: 'x' } }],
      },
    })
    cappedStorage.setItem(PERSIST_KEY, cache)
    expect(cappedStorage.getItem(PERSIST_KEY)).toBeNull()
    expect(reported).toHaveLength(1)
  })

  it('el tope solo aplica a la clave del persister, no a otras', () => {
    const value = 'x'.repeat(PERSIST_MAX_CHARS + 1)
    cappedStorage.setItem('otra_clave', value)
    expect(cappedStorage.getItem('otra_clave')).toBe(value)
    expect(reported).toHaveLength(0)
  })

  it('el tope deja margen real bajo el CursorWindow de 2 MB', () => {
    // Aunque cada carácter ocupara 2 bytes en UTF-8 (texto acentuado), el
    // máximo sigue por debajo del límite de Android.
    expect(PERSIST_MAX_CHARS * 2).toBeLessThan(2 * 1024 * 1024)
  })
})

describe('trimPersistedCache', () => {
  it('devuelve null para un valor que no es JSON', () => {
    expect(trimPersistedCache('x'.repeat(10))).toBeNull()
  })

  it('devuelve null para JSON sin clientState.queries', () => {
    expect(trimPersistedCache(JSON.stringify({ hola: 'mundo' }))).toBeNull()
  })

  it('quita solo las queries necesarias, de mayor a menor', () => {
    const query = (hash: string, size: number) => ({
      queryHash: hash,
      queryKey: [hash],
      state: { data: 'd'.repeat(size) },
    })
    const cache = JSON.stringify({
      buster: 'v-test',
      timestamp: 1,
      clientState: {
        mutations: [],
        queries: [
          query('mediana', 300_000),
          query('grande', 500_000),
          query('pequeña', 100),
        ],
      },
    })
    // 800k+ total: basta con quitar «grande» para bajar de 600k.
    const out = trimPersistedCache(cache)
    expect(out).not.toBeNull()
    expect(out!.length).toBeLessThanOrEqual(PERSIST_MAX_CHARS)
    const hashes = JSON.parse(out!).clientState.queries.map((q: any) => q.queryHash)
    expect(hashes).toEqual(['mediana', 'pequeña'])
  })
})
