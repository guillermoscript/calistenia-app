import { describe, it, expect } from 'vitest'
import { daysUntil, expiryFromDays, groupPantryByCategory } from './pantry'
import type { PantryItem } from '../types'

describe('expiryFromDays', () => {
  it('suma días a la fecha base', () => {
    expect(expiryFromDays(3, '2026-07-05')).toBe('2026-07-08')
  })
  it('cruza fin de mes y año', () => {
    expect(expiryFromDays(30, '2026-12-15')).toBe('2027-01-14')
  })
  it('null si days es null', () => {
    expect(expiryFromDays(null, '2026-07-05')).toBeNull()
  })
})

describe('groupPantryByCategory', () => {
  const item = (over: Partial<PantryItem>): PantryItem => ({
    id: 'x', name: 'a', nameNormalized: 'a', category: 'otro', quantity: 1,
    unit: 'unidad', priceTotal: null, currency: 'USD', priceSource: null,
    purchaseDate: null, expiryEstimate: null, confidence: 'high',
    status: 'active', source: 'chat', ...over,
  })

  it('agrupa en orden fijo de categorías, ordena filas por nombre', () => {
    const sections = groupPantryByCategory([
      item({ id: '1', category: 'vegetal', name: 'Tomate' }),
      item({ id: '2', category: 'proteina', name: 'Pollo' }),
      item({ id: '3', category: 'proteina', name: 'Atún' }),
    ])
    expect(sections.map(s => s.category)).toEqual(['proteina', 'vegetal'])
    expect(sections[0].data.map(i => i.name)).toEqual(['Atún', 'Pollo'])
  })
  it('categoría desconocida cae en otro', () => {
    const sections = groupPantryByCategory([item({ category: 'zzz' as never })])
    expect(sections[0].category).toBe('otro')
  })
  it('vacío devuelve []', () => {
    expect(groupPantryByCategory([])).toEqual([])
  })
})

describe('daysUntil', () => {
  it('días hacia adelante', () => {
    expect(daysUntil('2026-07-08', '2026-07-05')).toBe(3)
  })
  it('negativo si ya venció', () => {
    expect(daysUntil('2026-07-01', '2026-07-05')).toBe(-4)
  })
  it('null sin fecha', () => {
    expect(daysUntil(null, '2026-07-05')).toBeNull()
  })
})
