import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setTimezone } from './dateUtils'

// Estado compartido controlable por test para el pb falso — vi.hoisted evita
// el TDZ del factory de vi.mock (se ejecuta antes de que corran los `const`
// normales del archivo).
const h = vi.hoisted(() => ({
  available: true,
  items: {} as Record<string, unknown[]>,
  failing: new Set<string>(),
  filterCalls: [] as Array<{ raw: string; params: Record<string, unknown> }>,
}))

vi.mock('./pocketbase', () => ({
  pb: {
    // Réplica mínima del pb.filter real: interpola {:token} con los params.
    filter: (raw: string, params: Record<string, unknown>) => {
      h.filterCalls.push({ raw, params })
      return Object.entries(params).reduce(
        (s, [k, v]) => s.split(`{:${k}}`).join(String(v)),
        raw,
      )
    },
    collection: (name: string) => ({
      getList: async (_page: number, _perPage: number, _opts: unknown) => {
        if (h.failing.has(name)) throw new Error(`boom:${name}`)
        return { items: h.items[name] || [] }
      },
      getFullList: async (_opts: unknown) => {
        if (h.failing.has(name)) throw new Error(`boom:${name}`)
        return h.items[name] || []
      },
    }),
    files: {
      getURL: (rec: { id: string }, file: string) => `https://pb.test/api/files/body_photos/${rec.id}/${file}`,
    },
  },
  isPocketBaseAvailable: async () => h.available,
}))

const { fetchMonthActivity, emptyMonthActivity } = await import('./monthActivity')

beforeEach(() => {
  h.available = true
  h.items = {}
  h.failing = new Set()
  h.filterCalls = []
  setTimezone('UTC')
})

describe('emptyMonthActivity', () => {
  it('devuelve todas las colecciones vacías', () => {
    expect(emptyMonthActivity()).toEqual({
      cardio: [],
      circuits: [],
      nutritionByDate: {},
      waterByDate: {},
      sleepByDate: {},
      weightByDate: {},
      measurementByDate: {},
      photosByDate: {},
      lumbarByDate: {},
    })
  })
})

describe('fetchMonthActivity — PocketBase no disponible', () => {
  it('devuelve la estructura vacía sin lanzar', async () => {
    h.available = false
    const result = await fetchMonthActivity('u1', 2026, 5)
    expect(result).toEqual(emptyMonthActivity())
  })
})

describe('fetchMonthActivity — cardio y circuitos (paso directo)', () => {
  it('pasa los items de cardio_sessions y circuit_sessions tal cual llegan de PB', async () => {
    h.items.cardio_sessions = [
      { id: 'c1', started_at: '2026-06-15 08:00:00.000Z', distance_km: 5 },
    ]
    h.items.circuit_sessions = [
      { id: 'x1', started_at: '2026-06-16 09:00:00.000Z', mode: 'circuit' },
    ]
    const result = await fetchMonthActivity('u1', 2026, 5)
    expect(result.cardio).toEqual(h.items.cardio_sessions)
    expect(result.circuits).toEqual(h.items.circuit_sessions)
  })
})

describe('fetchMonthActivity — nutrición y agua (agrupadas por fecha local desde logged_at UTC)', () => {
  it('suma meals/calories del mismo día local y descarta logged_at vacío', async () => {
    h.items.nutrition_entries = [
      { id: 'n1', logged_at: '2026-06-10 08:00:00.000Z', total_calories: 500 },
      { id: 'n2', logged_at: '2026-06-10 20:00:00.000Z', total_calories: 700 },
      { id: 'n3', logged_at: '', total_calories: 100 }, // sin fecha -> se descarta
    ]
    const result = await fetchMonthActivity('u1', 2026, 5)
    expect(result.nutritionByDate).toEqual({ '2026-06-10': { meals: 2, calories: 1200 } })
  })

  it('suma amount_ml de agua del mismo día local', async () => {
    h.items.water_entries = [
      { id: 'w1', logged_at: '2026-06-10 08:00:00.000Z', amount_ml: 250 },
      { id: 'w2', logged_at: '2026-06-10 12:00:00.000Z', amount_ml: 300 },
    ]
    const result = await fetchMonthActivity('u1', 2026, 5)
    expect(result.waterByDate).toEqual({ '2026-06-10': { totalMl: 550 } })
  })

  it('cerca de medianoche, un registro UTC cae en el día local ANTERIOR con tz no-UTC', async () => {
    setTimezone('America/New_York') // UTC-4 en junio (DST)
    h.items.nutrition_entries = [
      // 2026-06-11 02:30 UTC = 2026-06-10 22:30 en New York.
      { id: 'n1', logged_at: '2026-06-11 02:30:00.000Z', total_calories: 400 },
    ]
    const result = await fetchMonthActivity('u1', 2026, 5)
    expect(result.nutritionByDate).toEqual({ '2026-06-10': { meals: 1, calories: 400 } })
    expect(result.nutritionByDate['2026-06-11']).toBeUndefined()
  })
})

describe('fetchMonthActivity — sleep/weight (campo `date` ya local, se agrupa por su prefijo)', () => {
  it('normaliza el campo date al prefijo YYYY-MM-DD', async () => {
    h.items.sleep_entries = [
      { id: 's1', date: '2026-06-12 00:00:00.000Z', quality: 4, duration_minutes: 400 },
    ]
    h.items.weight_entries = [
      { id: 'w1', date: '2026-06-13 00:00:00.000Z', weight_kg: 80.5 },
    ]
    const result = await fetchMonthActivity('u1', 2026, 5)
    expect(result.sleepByDate['2026-06-12']).toMatchObject({ id: 's1', date: '2026-06-12', quality: 4 })
    expect(result.weightByDate['2026-06-13']).toMatchObject({ id: 'w1', date: '2026-06-13', weight_kg: 80.5 })
  })
})

describe('fetchMonthActivity — medidas y chequeo lumbar (1 por día, gana el primero de la lista)', () => {
  it('measurementByDate: con dos registros el mismo día, conserva el PRIMERO del array (PB los manda -date, o sea el más reciente primero)', async () => {
    h.items.body_measurements = [
      { id: 'm-recent', date: '2026-06-15 00:00:00.000Z' },
      { id: 'm-older', date: '2026-06-15 00:00:00.000Z' },
    ]
    const result = await fetchMonthActivity('u1', 2026, 5)
    expect(result.measurementByDate['2026-06-15'].id).toBe('m-recent')
  })

  it('lumbarByDate: misma regla de "el primero gana"', async () => {
    h.items.lumbar_checks = [
      { id: 'l-recent', date: '2026-06-20 00:00:00.000Z', lumbar_score: 8 },
      { id: 'l-older', date: '2026-06-20 00:00:00.000Z', lumbar_score: 3 },
    ]
    const result = await fetchMonthActivity('u1', 2026, 5)
    expect(result.lumbarByDate['2026-06-20'].id).toBe('l-recent')
    expect(result.lumbarByDate['2026-06-20'].lumbar_score).toBe(8)
  })
})

describe('fetchMonthActivity — fotos de progreso (varias por día, cuenta + URLs servibles)', () => {
  it('acumula count y arma photos[] con pb.files.getURL', async () => {
    h.items.body_photos = [
      { id: 'p1', date: '2026-06-20 00:00:00.000Z', photo: 'a.jpg' },
      { id: 'p2', date: '2026-06-20 00:00:00.000Z', photo: 'b.jpg' },
    ]
    const result = await fetchMonthActivity('u1', 2026, 5)
    expect(result.photosByDate['2026-06-20']).toEqual({
      count: 2,
      photos: [
        { id: 'p1', url: 'https://pb.test/api/files/body_photos/p1/a.jpg' },
        { id: 'p2', url: 'https://pb.test/api/files/body_photos/p2/b.jpg' },
      ],
    })
  })

  it('un registro sin archivo `photo` cuenta pero no aporta URL', async () => {
    h.items.body_photos = [{ id: 'p3', date: '2026-06-21 00:00:00.000Z' }]
    const result = await fetchMonthActivity('u1', 2026, 5)
    expect(result.photosByDate['2026-06-21']).toEqual({ count: 1, photos: [] })
  })
})

describe('fetchMonthActivity — resiliencia: una fuente que falla no rompe las demás', () => {
  it('cardio falla -> queda vacío, se loguea warning, pero nutrición se sigue agregando', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    h.failing.add('cardio_sessions')
    h.items.nutrition_entries = [
      { id: 'n1', logged_at: '2026-06-10 08:00:00.000Z', total_calories: 500 },
    ]
    const result = await fetchMonthActivity('u1', 2026, 5)
    expect(result.cardio).toEqual([])
    expect(result.nutritionByDate).toEqual({ '2026-06-10': { meals: 1, calories: 500 } })
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('cardio fetch failed'),
      expect.anything(),
    )
    warnSpy.mockRestore()
  })
})

describe('fetchMonthActivity — límites de mes/año en el filtro de rango', () => {
  const dateRangeParams = () =>
    h.filterCalls.find((c) => c.raw.includes('date >='))?.params as
      | { start: string; end: string }
      | undefined
  const utcRangeParams = (field: string) =>
    h.filterCalls.find((c) => c.raw.includes(`${field} >=`))?.params as
      | { start: string; end: string }
      | undefined

  it('mes normal (junio, 30 días): el rango va del 1 de junio al 1 de julio', async () => {
    await fetchMonthActivity('u1', 2026, 5) // junio = month0 5
    expect(dateRangeParams()).toMatchObject({ start: '2026-06-01', end: '2026-07-01' })
  })

  it('enero (31 días) -> el siguiente mes es febrero, sin importar cuántos días tenga', async () => {
    await fetchMonthActivity('u1', 2026, 0)
    expect(dateRangeParams()).toMatchObject({ start: '2026-01-01', end: '2026-02-01' })
  })

  it('diciembre cruza el límite de AÑO: el rango termina en enero del año siguiente', async () => {
    await fetchMonthActivity('u1', 2026, 11) // diciembre = month0 11
    expect(dateRangeParams()).toMatchObject({ start: '2026-12-01', end: '2027-01-01' })
  })

  it('el rango UTC (started_at/logged_at) usa localMidnightAsUTC, no las fechas planas', async () => {
    // Con tz UTC, medianoche local == medianoche UTC, así que coincide con las fechas planas.
    await fetchMonthActivity('u1', 2026, 11)
    expect(utcRangeParams('started_at')).toMatchObject({ start: '2026-12-01 00:00:00', end: '2027-01-01 00:00:00' })
  })

  it('con un tz con offset, el rango UTC se desplaza pero las fechas `date` planas no', async () => {
    setTimezone('America/New_York') // UTC-5 en diciembre (EST)
    await fetchMonthActivity('u1', 2026, 11)
    expect(utcRangeParams('started_at')).toMatchObject({ start: '2026-12-01 05:00:00', end: '2027-01-01 05:00:00' })
    expect(dateRangeParams()).toMatchObject({ start: '2026-12-01', end: '2027-01-01' })
  })
})
