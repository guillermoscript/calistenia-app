/**
 * Hidratación resiliente del storage (#661).
 *
 * El crash real: `getMany` lee todas las claves de AsyncStorage de golpe y en
 * Android una fila mayor que el CursorWindow (~2 MB) lanza
 * «Row too big to fit into CursorWindow», tumbando la lectura ENTERA. Como el
 * boot esperaba esa promesa, la app se quedaba en el splash para siempre.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const CURSOR_ERROR = new Error(
  'Row too big to fit into CursorWindow requiredPos=6, totalRows=7'
)

const asyncStorage = {
  getAllKeys: vi.fn(),
  getMany: vi.fn(),
  getItem: vi.fn(),
  setItem: vi.fn(async () => {}),
  removeItem: vi.fn(async () => {}),
}

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: asyncStorage,
}))
vi.mock('@sentry/react-native', () => ({ captureException: vi.fn() }))

/** El módulo guarda `hydrated` en estado de módulo → una instancia por test. */
async function freshStorage() {
  vi.resetModules()
  return import('../storage')
}

/** Disco con una clave gorda que revienta el CursorWindow, como en producción. */
function mockDiscoConUnaClaveGorda() {
  asyncStorage.getAllKeys.mockResolvedValue(['pb_auth', 'calistenia_rq_cache'])
  asyncStorage.getMany.mockRejectedValue(CURSOR_ERROR)
  asyncStorage.getItem.mockImplementation(async (key: string) =>
    key === 'calistenia_rq_cache' ? Promise.reject(CURSOR_ERROR) : 'token'
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('hydrateStorage', () => {
  it('camino feliz: vuelca el lote de getMany en la caché síncrona', async () => {
    asyncStorage.getAllKeys.mockResolvedValue(['a', 'b'])
    asyncStorage.getMany.mockResolvedValue({ a: '1', b: '2' })

    const { hydrateStorage, syncStorage } = await freshStorage()
    await hydrateStorage()

    expect(syncStorage.getItem('a')).toBe('1')
    expect(syncStorage.getItem('b')).toBe('2')
  })

  it('una clave de más de 2 MB NO impide arrancar: resuelve igual', async () => {
    mockDiscoConUnaClaveGorda()

    const { hydrateStorage } = await freshStorage()
    // Lo que rompía la app: esta promesa rechazaba y el boot moría con ella.
    await expect(hydrateStorage()).resolves.toBeUndefined()
  })

  it('salva las claves que sí caben y solo pierde la gorda', async () => {
    mockDiscoConUnaClaveGorda()

    const { hydrateStorage, syncStorage } = await freshStorage()
    await hydrateStorage()

    // La sesión persistida sobrevive: el usuario no acaba en la pantalla de login.
    expect(syncStorage.getItem('pb_auth')).toBe('token')
    expect(syncStorage.getItem('calistenia_rq_cache')).toBeNull()
  })

  it('borra de disco la clave ilegible para no repetir el fallo en cada arranque', async () => {
    mockDiscoConUnaClaveGorda()

    const { hydrateStorage } = await freshStorage()
    await hydrateStorage()

    expect(asyncStorage.removeItem).toHaveBeenCalledWith('calistenia_rq_cache')
    expect(asyncStorage.removeItem).not.toHaveBeenCalledWith('pb_auth')
  })

  it('si hasta getAllKeys falla, arranca con la caché vacía en vez de no arrancar', async () => {
    asyncStorage.getAllKeys.mockRejectedValue(new Error('SQLite muerto'))

    const { hydrateStorage, syncStorage } = await freshStorage()
    await expect(hydrateStorage()).resolves.toBeUndefined()
    expect(syncStorage.getItem('lo-que-sea')).toBeNull()
  })

  it('es idempotente: la segunda llamada no vuelve a leer disco', async () => {
    asyncStorage.getAllKeys.mockResolvedValue(['a'])
    asyncStorage.getMany.mockResolvedValue({ a: '1' })

    const { hydrateStorage } = await freshStorage()
    await hydrateStorage()
    await hydrateStorage()

    expect(asyncStorage.getAllKeys).toHaveBeenCalledTimes(1)
  })

  it('tras un fallo NO se reintenta: reintentar volvería a fallar y colgaría el arranque', async () => {
    asyncStorage.getAllKeys.mockRejectedValue(new Error('SQLite muerto'))

    const { hydrateStorage } = await freshStorage()
    await hydrateStorage()
    await hydrateStorage()

    expect(asyncStorage.getAllKeys).toHaveBeenCalledTimes(1)
  })
})
