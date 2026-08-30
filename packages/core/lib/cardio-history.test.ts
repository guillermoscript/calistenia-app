import { describe, it, expect } from 'vitest'
import { mergeCardioPages, hasMoreCardioPages, CARDIO_HISTORY_PAGE_SIZE } from './cardio-history'
import type { CardioSession } from '../types'

const session = (id: string, over: Partial<CardioSession> = {}): CardioSession => ({
  id,
  activity_type: 'running',
  gps_points: [],
  distance_km: 1,
  duration_seconds: 300,
  avg_pace: 300,
  elevation_gain: 0,
  started_at: '2026-08-29T10:00:00.000Z',
  ...over,
})

describe('mergeCardioPages', () => {
  it('añade la página nueva al final', () => {
    const merged = mergeCardioPages([session('a'), session('b')], [session('c')])
    expect(merged.map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('descarta las sesiones que ya estaban', () => {
    const merged = mergeCardioPages([session('a'), session('b')], [session('b'), session('c')])
    expect(merged.map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('devuelve la lista anterior sin tocar si la página no aporta nada', () => {
    const prev = [session('a')]
    expect(mergeCardioPages(prev, [session('a')])).toBe(prev)
  })

  it('no descarta duplicados dentro de la propia página nueva por separado', () => {
    // Dos registros distintos con los mismos datos SÍ son dos sesiones: sólo
    // el `id` decide. Los duplicados reales de datos no son cosa de esta capa.
    const merged = mergeCardioPages([], [session('a', { distance_km: 2 }), session('b', { distance_km: 2 })])
    expect(merged).toHaveLength(2)
  })

  it('deja pasar las sesiones sin id (cola offline)', () => {
    const merged = mergeCardioPages([session('a')], [
      { ...session('x'), id: undefined },
      { ...session('y'), id: undefined },
    ])
    expect(merged).toHaveLength(3)
  })
})

describe('hasMoreCardioPages', () => {
  it('una página entera deja la puerta abierta', () => {
    expect(hasMoreCardioPages(CARDIO_HISTORY_PAGE_SIZE, CARDIO_HISTORY_PAGE_SIZE)).toBe(true)
  })

  it('una página incompleta es la última', () => {
    expect(hasMoreCardioPages(CARDIO_HISTORY_PAGE_SIZE, 7)).toBe(false)
  })

  it('una página vacía es la última', () => {
    expect(hasMoreCardioPages(CARDIO_HISTORY_PAGE_SIZE, 0)).toBe(false)
  })
})
