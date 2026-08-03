import { describe, it, expect, vi, beforeEach } from 'vitest'

const collection = vi.fn()
vi.mock('./pocketbase', () => ({
  pb: {
    collection: (name: string) => collection(name),
    filter: (raw: string, params: Record<string, string>) =>
      raw.replace(/\{:(\w+)\}/g, (_, k) => `'${params[k]}'`),
  },
}))

import { splitRoute, saveCardioRoute, fetchCardioRoute, fetchCardioRoutes, hydrateCardioRoutes } from './cardioRoutes'

const POINTS = [
  { lat: 40.4, lng: -3.7, timestamp: 1 },
  { lat: 40.5, lng: -3.8, timestamp: 2 },
]

/** Mock de una colección de PocketBase con solo lo que use cada test. */
function mockCollection(impl: Record<string, unknown> = {}) {
  const mock = {
    create: vi.fn().mockResolvedValue({ id: 'route-1' }),
    update: vi.fn().mockResolvedValue({ id: 'route-1' }),
    getFirstListItem: vi.fn().mockRejectedValue(new Error('no encontrada')),
    getFullList: vi.fn().mockResolvedValue([]),
    ...impl,
  }
  collection.mockReturnValue(mock)
  return mock
}

beforeEach(() => collection.mockReset())

describe('splitRoute', () => {
  it('saca gps_points del cuerpo que va a cardio_sessions', () => {
    const { record, points } = splitRoute({ user: 'u1', distance_km: 5, gps_points: POINTS })
    expect(record).toEqual({ user: 'u1', distance_km: 5 })
    expect(record).not.toHaveProperty('gps_points')
    expect(points).toEqual(POINTS)
  })

  it('sin ruta devuelve el cuerpo intacto y una lista vacía', () => {
    const { record, points } = splitRoute({ user: 'u1', distance_km: 5 })
    expect(record).toEqual({ user: 'u1', distance_km: 5 })
    expect(points).toEqual([])
  })

  it('un gps_points corrupto se degrada a lista vacía en vez de reventar', () => {
    const { points } = splitRoute({ gps_points: 'esto no es una ruta' })
    expect(points).toEqual([])
  })
})

describe('saveCardioRoute', () => {
  it('crea la fila cuando no existe', async () => {
    const c = mockCollection()
    await saveCardioRoute('sess-1', 'u1', POINTS)
    expect(c.create).toHaveBeenCalledWith({ session: 'sess-1', user: 'u1', points: POINTS })
  })

  it('actualiza en vez de duplicar si ya hay ruta para esa sesión', async () => {
    const c = mockCollection({ getFirstListItem: vi.fn().mockResolvedValue({ id: 'route-9' }) })
    await saveCardioRoute('sess-1', 'u1', POINTS)
    expect(c.update).toHaveBeenCalledWith('route-9', { points: POINTS })
    expect(c.create).not.toHaveBeenCalled()
  })

  it('sin puntos no toca PocketBase: una sesión de cinta no necesita ruta', async () => {
    const c = mockCollection()
    await saveCardioRoute('sess-1', 'u1', [])
    expect(c.create).not.toHaveBeenCalled()
    expect(c.update).not.toHaveBeenCalled()
  })

  it('si falla el guardado no propaga: la sesión ya está a salvo', async () => {
    mockCollection({ create: vi.fn().mockRejectedValue(new Error('sin red')) })
    await expect(saveCardioRoute('sess-1', 'u1', POINTS)).resolves.toBeUndefined()
  })
})

describe('fetchCardioRoute', () => {
  it('devuelve los puntos de la sesión', async () => {
    mockCollection({ getFirstListItem: vi.fn().mockResolvedValue({ points: POINTS }) })
    expect(await fetchCardioRoute('sess-1')).toEqual(POINTS)
  })

  it('una ruta ajena (404 por regla de lista) se lee como "no hay ruta"', async () => {
    mockCollection({ getFirstListItem: vi.fn().mockRejectedValue({ status: 404 }) })
    expect(await fetchCardioRoute('sess-ajena')).toEqual([])
  })
})

describe('fetchCardioRoutes / hydrateCardioRoutes', () => {
  it('mapea sesión → puntos en una sola consulta', async () => {
    const c = mockCollection({
      getFullList: vi.fn().mockResolvedValue([
        { session: 'a', points: POINTS },
        { session: 'b', points: [] },
      ]),
    })
    expect(await fetchCardioRoutes(['a', 'b'])).toEqual({ a: POINTS, b: [] })
    expect(c.getFullList).toHaveBeenCalledTimes(1)
  })

  it('sin ids no consulta nada', async () => {
    const c = mockCollection()
    expect(await fetchCardioRoutes([])).toEqual({})
    expect(c.getFullList).not.toHaveBeenCalled()
  })

  it('trocea para no montar un filtro gigante', async () => {
    const c = mockCollection()
    await fetchCardioRoutes(Array.from({ length: 85 }, (_, i) => `s${i}`))
    expect(c.getFullList).toHaveBeenCalledTimes(3) // 40 + 40 + 5
  })

  it('hidrata solo las sesiones que tienen ruta y deja el resto vacías', async () => {
    mockCollection({ getFullList: vi.fn().mockResolvedValue([{ session: 'a', points: POINTS }]) })
    const sessions = [
      { id: 'a', gps_points: [] },
      { id: 'b', gps_points: [] },
    ]
    const out = await hydrateCardioRoutes(sessions)
    expect(out[0].gps_points).toEqual(POINTS)
    expect(out[1].gps_points).toEqual([])
  })

  it('si la consulta de rutas falla, el historial sigue devolviéndose sin mapas', async () => {
    mockCollection({ getFullList: vi.fn().mockRejectedValue(new Error('sin red')) })
    const out = await hydrateCardioRoutes([{ id: 'a', gps_points: [] }])
    expect(out).toEqual([{ id: 'a', gps_points: [] }])
  })
})
