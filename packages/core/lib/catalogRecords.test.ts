/**
 * Las lecturas puntuales del catálogo pasan por el mapper de core: la identidad
 * que sale es el slug (nunca la clave aleatoria de PB) y un fallo no rompe.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({ available: true, items: [] as Record<string, unknown>[], fail: false }))

vi.mock('./pocketbase', () => ({
  isPocketBaseAvailable: async () => state.available,
  pb: {
    filter: (q: string, p: Record<string, unknown>) => `${q}|${JSON.stringify(p)}`,
    collection: () => ({
      getList: async () => {
        if (state.fail) throw new Error('boom')
        return { items: state.items }
      },
      getOne: async () => state.items[0],
    }),
  },
}))

import { fetchCatalogExercise, fetchCatalogExerciseByRecordId, fetchCatalogRecords } from './catalogRecords'

beforeEach(() => {
  state.available = true
  state.fail = false
  state.items = [{ id: 'abc123', slug: 'mi-ejercicio-privado', name: 'Mi ejercicio' }]
})

describe('catalogRecords', () => {
  it('fetchCatalogExercise devuelve el slug como identidad', async () => {
    const ex = await fetchCatalogExercise('mi-ejercicio-privado')
    expect(ex?.slug).toBe('mi-ejercicio-privado')
    expect(ex?.id).toBe('abc123')
  })

  it('fetchCatalogExercise da null sin PB, sin resultados o con error', async () => {
    state.available = false
    expect(await fetchCatalogExercise('x')).toBeNull()
    state.available = true
    state.items = []
    expect(await fetchCatalogExercise('x')).toBeNull()
    state.fail = true
    expect(await fetchCatalogExercise('x')).toBeNull()
    expect(await fetchCatalogExercise('')).toBeNull()
  })

  it('fetchCatalogExerciseByRecordId y fetchCatalogRecords mapean', async () => {
    expect((await fetchCatalogExerciseByRecordId('abc123')).slug).toBe('mi-ejercicio-privado')
    const list = await fetchCatalogRecords({ fields: 'id,name' })
    expect(list.map(e => e.id)).toEqual(['abc123'])
  })
})
