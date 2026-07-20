import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

import {
  FEATURE_CATEGORY_ORDER,
  groupFeatures,
  type FeatureCategory,
  type FeatureEntry,
} from './discover'

// El catálogo real: los tests lo validan como contrato (añadir una feature mal
// formada al JSON rompe la suite, no la app en runtime).
const catalog: FeatureEntry[] = JSON.parse(
  readFileSync(new URL('../data/features.json', import.meta.url), 'utf8'),
)

const entry = (id: string, category: FeatureCategory): FeatureEntry => ({
  id,
  icon: 'Star',
  category,
  title: { es: 'x', en: 'x' },
  body: { es: 'x', en: 'x' },
  route: null,
})

describe('features.json (catálogo)', () => {
  it('tiene ids únicos', () => {
    const ids = catalog.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('cada entrada está completa y bilingüe', () => {
    for (const f of catalog) {
      expect(f.id, f.id).toBeTruthy()
      expect(f.icon, f.id).toBeTruthy()
      expect(FEATURE_CATEGORY_ORDER).toContain(f.category)
      expect(f.title.es, f.id).toBeTruthy()
      expect(f.title.en, f.id).toBeTruthy()
      expect(f.body.es, f.id).toBeTruthy()
      expect(f.body.en, f.id).toBeTruthy()
      if (f.route !== null) expect(f.route, f.id).toMatch(/^\//)
    }
  })

  it('cubre las 5 categorías', () => {
    const cats = new Set(catalog.map((f) => f.category))
    expect(cats.size).toBe(FEATURE_CATEGORY_ORDER.length)
  })
})

describe('groupFeatures', () => {
  it('agrupa en el orden fijo de categorías, no en el de entrada', () => {
    const groups = groupFeatures([
      entry('a', 'extras'),
      entry('b', 'training'),
      entry('c', 'progress'),
    ])
    expect(groups.map((g) => g.category)).toEqual(['training', 'progress', 'extras'])
  })

  it('omite categorías vacías', () => {
    const groups = groupFeatures([entry('a', 'nutrition')])
    expect(groups).toHaveLength(1)
    expect(groups[0].category).toBe('nutrition')
  })

  it('preserva el orden de las entradas dentro de cada grupo', () => {
    const groups = groupFeatures([
      entry('first', 'training'),
      entry('x', 'extras'),
      entry('second', 'training'),
    ])
    expect(groups[0].features.map((f) => f.id)).toEqual(['first', 'second'])
  })

  it('devuelve el catálogo real completo, sin perder entradas', () => {
    const groups = groupFeatures(catalog)
    const total = groups.reduce((n, g) => n + g.features.length, 0)
    expect(total).toBe(catalog.length)
  })
})
