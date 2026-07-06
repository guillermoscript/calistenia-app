import { describe, it, expect } from 'vitest'
import { buildPantrySnapshot, computePantryConfidence, daysUntil, expiryFromDays, groupPantryByCategory, normalizePantryName } from './pantry'
import type { PantryItem } from '../types'

describe('normalizePantryName', () => {
  it('minúsculas, sin acentos, trim', () => {
    expect(normalizePantryName('  Plátano Maduro ')).toBe('platano maduro')
  })
})

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

describe('buildPantrySnapshot', () => {
  const base: PantryItem = {
    id: 'x1', name: 'Pollo', nameNormalized: 'pollo', category: 'proteina',
    quantity: 2, unit: 'kg', priceTotal: null, currency: 'USD', priceSource: null,
    purchaseDate: '2026-07-01', expiryEstimate: '2026-07-08',
    confidence: 'high', status: 'active', source: 'chat',
  }

  it('mapea camelCase → snake_case del wire', () => {
    expect(buildPantrySnapshot([base])).toEqual([{
      name: 'Pollo', name_normalized: 'pollo', category: 'proteina',
      quantity: 2, unit: 'kg', expiry_estimate: '2026-07-08', confidence: 'high',
    }])
  })

  it('filtra items no activos', () => {
    const depleted = { ...base, id: 'x2', status: 'depleted' as const }
    expect(buildPantrySnapshot([base, depleted])).toHaveLength(1)
  })

  it('array vacío → array vacío', () => {
    expect(buildPantrySnapshot([])).toEqual([])
  })
})

const baseItem = (over: Partial<PantryItem> = {}): PantryItem => ({
  id: 'x1', name: 'Pollo', nameNormalized: 'pollo', category: 'proteina',
  quantity: 1, unit: 'kg', priceTotal: null, currency: 'USD', priceSource: null,
  purchaseDate: null, expiryEstimate: null, confidence: 'high', status: 'active',
  source: 'chat', ...over,
})

describe('computePantryConfidence', () => {
  const today = '2026-07-06'
  it('actividad reciente (<4d) → high', () => {
    expect(computePantryConfidence(baseItem(), '2026-07-04', today)).toBe('high')
    expect(computePantryConfidence(baseItem(), '2026-07-06', today)).toBe('high')
  })
  it('4-10 días → med', () => {
    expect(computePantryConfidence(baseItem(), '2026-07-02', today)).toBe('med')
    expect(computePantryConfidence(baseItem(), '2026-06-26', today)).toBe('med')
  })
  it('>10 días → low', () => {
    expect(computePantryConfidence(baseItem(), '2026-06-25', today)).toBe('low')
  })
  it('vencido → siempre low aunque haya actividad reciente', () => {
    expect(computePantryConfidence(baseItem({ expiryEstimate: '2026-07-01' }), today, today)).toBe('low')
  })
  it('vence hoy o después NO es vencido', () => {
    expect(computePantryConfidence(baseItem({ expiryEstimate: '2026-07-06' }), today, today)).toBe('high')
  })
  it('sin lastEventDate → conserva la confianza guardada (parseo inicial)', () => {
    expect(computePantryConfidence(baseItem({ confidence: 'med' }), null, today)).toBe('med')
  })
  it('fecha inválida → conserva la guardada', () => {
    expect(computePantryConfidence(baseItem({ confidence: 'med' }), 'garbage', today)).toBe('med')
  })
})

describe('buildPantrySnapshot confidence', () => {
  it('incluye confidence en el shape wire', () => {
    const snap = buildPantrySnapshot([baseItem({ confidence: 'low' })])
    expect(snap[0].confidence).toBe('low')
  })
})
