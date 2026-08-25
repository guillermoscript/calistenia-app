/**
 * `fetchProgramDetailRows` sin topes de página (#614).
 *
 * Las tres consultas del detalle llevaban un tope escrito a mano —20 fases,
 * 2.000 ejercicios, 200 day-configs—. Un tope de `getList` que se alcanza no da
 * error: devuelve la primera página y se calla, así que un programa que lo
 * pasara se pintaba incompleto sin que nada lo dijera.
 *
 * Estos tests fijan que la consulta pide la lista ENTERA. Afirman sobre el
 * método que se llama, no sobre el número, precisamente porque el fallo que
 * cubren es «alguien vuelve a escribir un número mágico aquí».
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RecordModel } from 'pocketbase'

const getFullList = vi.fn()
const getList = vi.fn()

vi.mock('./pocketbase', () => ({
  pb: {
    // Interpola de verdad en vez de devolver la plantilla: si el stub ignorase
    // los parámetros, un `filter` que se dejara el id fuera pasaría el test.
    filter: (expr: string, params: Record<string, string>) =>
      expr.replace(/\{:(\w+)\}/g, (_m, key: string) => JSON.stringify(params[key])),
    collection: (name: string) => ({
      getFullList: (opts: unknown) => getFullList(name, opts),
      getList: (page: number, perPage: number, opts: unknown) => getList(name, page, perPage, opts),
    }),
  },
  isPocketBaseAvailable: vi.fn().mockResolvedValue(true),
}))

import { fetchProgramDetailRows } from './programDetailQuery'

const row = (collection: string, id: string): RecordModel => ({
  id,
  collectionId: collection,
  collectionName: collection,
} as unknown as RecordModel)

beforeEach(() => {
  getFullList.mockReset()
  getList.mockReset()
  getFullList.mockImplementation((name: string) => Promise.resolve([row(name, `${name}-1`)]))
})

describe('fetchProgramDetailRows', () => {
  it('devuelve las filas de las tres colecciones', async () => {
    const rows = await fetchProgramDetailRows('prog-1')

    expect(rows.phases).toEqual([row('program_phases', 'program_phases-1')])
    expect(rows.exercises).toEqual([row('program_exercises', 'program_exercises-1')])
    expect(rows.dayConfigs).toEqual([row('program_day_config', 'program_day_config-1')])
  })

  it('pide las tres colecciones enteras: ni un solo `getList` con tope', async () => {
    await fetchProgramDetailRows('prog-1')

    expect(getList).not.toHaveBeenCalled()
    expect(getFullList.mock.calls.map(c => c[0]).sort()).toEqual([
      'program_day_config', 'program_exercises', 'program_phases',
    ])
  })

  it('filtra por el programa pedido y conserva el orden de cada colección', async () => {
    await fetchProgramDetailRows('prog-1')

    const byName = Object.fromEntries(getFullList.mock.calls.map(c => [c[0], c[1] as Record<string, unknown>]))
    expect(byName['program_phases'].filter).toBe('program = "prog-1"')
    expect(byName['program_phases'].sort).toBe('sort_order')
    expect(byName['program_exercises'].sort).toBe('phase_number,sort_order')
    expect(byName['program_day_config'].sort).toBe('phase_number,sort_order')
  })

  it('desactiva la auto-cancelación: las tres salen juntas y se matarían entre ellas', async () => {
    await fetchProgramDetailRows('prog-1')

    for (const [, opts] of getFullList.mock.calls) {
      expect((opts as Record<string, unknown>).$autoCancel).toBe(false)
    }
  })

  it('se traga el 404 de `program_day_config` y devuelve el resto', async () => {
    // La colección se añadió después que las otras dos: un servidor viejo no la
    // tiene, y eso no debe dejar al usuario sin el detalle del programa.
    getFullList.mockImplementation((name: string) => {
      if (name === 'program_day_config') return Promise.reject({ status: 404 })
      return Promise.resolve([row(name, `${name}-1`)])
    })

    const rows = await fetchProgramDetailRows('prog-1')

    expect(rows.dayConfigs).toEqual([])
    expect(rows.phases).toHaveLength(1)
    expect(rows.exercises).toHaveLength(1)
  })
})
