/**
 * Los conteos de seguidores de un programa (#620).
 *
 * Lo que se fija aquí no son los números —los suma SQLite en la view— sino las
 * dos decisiones que se pueden romper sin que nada falle en rojo:
 *
 * 1. Un programa que no vino en la respuesta se queda FUERA de `statsById`. Una
 *    view de PocketBase cuya regla de lectura no casa devuelve 0 filas sin
 *    error, así que rellenar con ceros convertiría un fallo de permisos en un
 *    «0 personas lo siguen» perfectamente creíble.
 * 2. Un servidor sin la migración aplicada (404 en la colección) no puede
 *    tumbar la pantalla: el contador es un adorno.
 *
 * El hook en sí no se monta: los tests de core corren en node sin
 * testing-library. Lo que tiene la lógica es `fetchProgramStats`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

/** Cada `getFullList` que sale hacia PocketBase, con su filtro. */
const listCalls: Array<{ collection: string; filter: string }> = []

/** Filas que devuelve el servidor. Se reasigna por test. */
let rows: Array<Record<string, unknown>> = []
/** Si está puesto, `getFullList` rechaza con esto en vez de devolver filas. */
let listError: unknown = null

vi.mock('../lib/pocketbase', () => ({
  pb: {
    authStore: { isValid: true },
    files: { getURL: vi.fn() },
    filter: (expr: string, params: Record<string, string>) =>
      expr.replace(/\{:(\w+)\}/g, (_m, key: string) => `'${params[key]}'`),
    collection: (collection: string) => ({
      getFullList: (opts: { filter: string }) => {
        listCalls.push({ collection, filter: opts.filter })
        return listError ? Promise.reject(listError) : Promise.resolve(rows)
      },
    }),
  },
  isPocketBaseAvailable: vi.fn().mockResolvedValue(true),
}))

import { fetchProgramStats } from './useProgramStats'

const statsRow = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  collectionId: 'view_program_stats',
  collectionName: 'view_program_stats',
  active_count: 3,
  completed_count: 2,
  followers_count: 5,
  athletes_count: 4,
  ...over,
})

beforeEach(() => {
  listCalls.length = 0
  rows = []
  listError = null
})

describe('fetchProgramStats', () => {
  it('mapea las cuatro columnas de la view', async () => {
    rows = [statsRow('prog-1')]
    const byId = await fetchProgramStats(['prog-1'])

    expect(byId['prog-1']).toEqual({
      activeCount: 3,
      completedCount: 2,
      followersCount: 5,
      athletesCount: 4,
    })
  })

  it('no pide nada con la lista vacía', async () => {
    // El catálogo llega vacío en el primer render; preguntar por cero programas
    // sería una petición que devuelve la base entera o un filtro `` inválido.
    expect(await fetchProgramStats([])).toEqual({})
    expect(listCalls).toHaveLength(0)
  })

  it('DEJA FUERA al programa que no vino, en vez de meterlo a 0', async () => {
    // Este es el test que importa. `prog-2` se pidió y no volvió: puede ser que
    // nadie lo siga o que la regla de lectura no deje verlo, y desde el cliente
    // no se distinguen. La UI solo puede callarse si aquí llega `undefined`.
    rows = [statsRow('prog-1')]
    const byId = await fetchProgramStats(['prog-1', 'prog-2'])

    expect(byId['prog-1']).toBeDefined()
    expect(byId['prog-2']).toBeUndefined()
    expect('prog-2' in byId).toBe(false)
  })

  it('trocea de 50 en 50 para no armar una URL que el servidor rechace', async () => {
    const ids = Array.from({ length: 120 }, (_, i) => `prog-${i}`)
    await fetchProgramStats(ids)

    expect(listCalls).toHaveLength(3)
    // Y ningún id se pierde por el camino: los tres filtros juntos los nombran
    // todos exactamente una vez.
    const mentioned = listCalls.flatMap(c => c.filter.split(' || '))
    expect(mentioned).toHaveLength(120)
    for (const id of ids) expect(mentioned).toContain(`id = '${id}'`)
  })

  it('un servidor sin la migración (404) devuelve {} en vez de lanzar', async () => {
    listError = { status: 404, message: "Missing collection context." }
    await expect(fetchProgramStats(['prog-1'])).resolves.toEqual({})
  })

  it('una columna ausente cuenta como 0, no como NaN', async () => {
    // `Number(undefined)` es NaN y se propagaría hasta la pantalla como
    // «NaN personas lo siguen».
    rows = [{ id: 'prog-1', collectionId: 'v', collectionName: 'v' }]
    const byId = await fetchProgramStats(['prog-1'])

    expect(byId['prog-1']).toEqual({
      activeCount: 0, completedCount: 0, followersCount: 0, athletesCount: 0,
    })
  })
})
