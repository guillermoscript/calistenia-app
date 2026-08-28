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
import { cappedStorage, PERSIST_KEY, PERSIST_MAX_CHARS } from './query-client'

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

  it('descarta un caché por encima del tope en vez de escribirlo', () => {
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
