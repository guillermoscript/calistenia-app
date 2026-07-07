import { describe, it, expect } from 'vitest'
import { computeEntryCost, computeSpendSummary } from './spend'
import type { PantryEvent, PantryItem } from '../types'

const item = (over: Partial<PantryItem>): PantryItem => ({
  id: 'x', name: 'a', nameNormalized: 'a', category: 'otro', quantity: 1,
  unit: 'unidad', priceTotal: null, currency: 'USD', priceSource: null,
  purchaseDate: null, expiryEstimate: null, confidence: 'high',
  status: 'active', source: 'chat', ...over,
})
const ev = (over: Partial<PantryEvent>): PantryEvent => ({
  id: 'e', item: 'x', type: 'consume', deltaQty: -1, linkedEntry: 'entry1', ...over,
})

describe('computeEntryCost', () => {
  it('criterio de aceptación #174: pollo $8/2kg, 500g consumidos → $2.00', () => {
    const pollo = item({ id: 'p1', quantity: 2, unit: 'kg', priceTotal: 8 })
    const events = [ev({ item: 'p1', deltaQty: -0.5 })] // delta en la UNIDAD del item (kg)
    const cost = computeEntryCost('entry1', 1, events, new Map([['p1', pollo]]))
    expect(cost.total).toBeCloseTo(2, 5)
    expect(cost.coverage).toBe('full')
    expect(cost.currency).toBe('USD')
  })

  it('sin eventos linked → none con total 0', () => {
    expect(computeEntryCost('entry1', 2, [], new Map())).toEqual({ total: 0, currency: 'USD', coverage: 'none' })
  })

  it('eventos de OTRO entry no cuentan', () => {
    const p = item({ id: 'p1', quantity: 1, unit: 'kg', priceTotal: 4 })
    const events = [ev({ item: 'p1', deltaQty: -0.5, linkedEntry: 'otro' })]
    expect(computeEntryCost('entry1', 1, events, new Map([['p1', p]])).coverage).toBe('none')
  })

  it('item sin precio → partial (hay evento pero costo incompleto)', () => {
    const conPrecio = item({ id: 'p1', quantity: 1, unit: 'kg', priceTotal: 4 })
    const sinPrecio = item({ id: 'p2', quantity: 6, unit: 'unidad', priceTotal: null })
    const events = [ev({ id: 'e1', item: 'p1', deltaQty: -0.25 }), ev({ id: 'e2', item: 'p2', deltaQty: -2 })]
    const cost = computeEntryCost('entry1', 2, events, new Map([['p1', conPrecio], ['p2', sinPrecio]]))
    expect(cost.total).toBeCloseTo(1, 5)
    expect(cost.coverage).toBe('partial')
  })

  it('menos eventos que foods → partial (food sin match)', () => {
    const p = item({ id: 'p1', quantity: 2, unit: 'kg', priceTotal: 8 })
    const events = [ev({ item: 'p1', deltaQty: -0.5 })]
    expect(computeEntryCost('entry1', 3, events, new Map([['p1', p]])).coverage).toBe('partial')
  })

  it('todos los eventos sin precio → none (no mostrar $0 falso)', () => {
    const p = item({ id: 'p1', quantity: 2, unit: 'kg', priceTotal: null })
    const events = [ev({ item: 'p1', deltaQty: -0.5 })]
    expect(computeEntryCost('entry1', 1, events, new Map([['p1', p]])).coverage).toBe('none')
  })
})

describe('computeSpendSummary', () => {
  const pollo = item({ id: 'p1', quantity: 2, unit: 'kg', priceTotal: 8 })
  const itemsById = new Map([['p1', pollo]])

  it('bucketiza por día, total semanal y promedio por comida', () => {
    const entries = [
      { id: 'a', date: '2026-07-06', foodsCount: 1 },  // lunes
      { id: 'b', date: '2026-07-07', foodsCount: 1 },
      { id: 'c', date: '2026-07-07', foodsCount: 1 },  // sin eventos → no cuenta
    ]
    const events = [
      ev({ id: 'e1', item: 'p1', deltaQty: -0.5, linkedEntry: 'a' }),   // $2
      ev({ id: 'e2', item: 'p1', deltaQty: -0.25, linkedEntry: 'b' }),  // $1
    ]
    const s = computeSpendSummary(entries, events, itemsById, '2026-07-06')
    expect(s.weekTotal).toBeCloseTo(3, 5)
    expect(s.byDay).toHaveLength(7)
    expect(s.byDay[0]).toEqual({ date: '2026-07-06', total: 2 })
    expect(s.byDay[1].total).toBeCloseTo(1, 5)
    expect(s.mealsWithCost).toBe(2)
    expect(s.avgPerMeal).toBeCloseTo(1.5, 5)
    expect(s.hasPartial).toBe(false)
  })

  it('entry fuera de la semana no cuenta; partial propaga hasPartial', () => {
    const entries = [
      { id: 'a', date: '2026-07-05', foodsCount: 1 },  // fuera (domingo anterior)
      { id: 'b', date: '2026-07-08', foodsCount: 2 },  // 2 foods, 1 evento → partial
    ]
    const events = [
      ev({ id: 'e1', item: 'p1', deltaQty: -0.5, linkedEntry: 'a' }),
      ev({ id: 'e2', item: 'p1', deltaQty: -0.5, linkedEntry: 'b' }),
    ]
    const s = computeSpendSummary(entries, events, itemsById, '2026-07-06')
    expect(s.weekTotal).toBeCloseTo(2, 5)
    expect(s.mealsWithCost).toBe(1)
    expect(s.hasPartial).toBe(true)
  })

  it('semana vacía → todo en cero', () => {
    const s = computeSpendSummary([], [], new Map(), '2026-07-06')
    expect(s).toMatchObject({ weekTotal: 0, avgPerMeal: 0, mealsWithCost: 0, hasPartial: false })
  })
})
