import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import es from '@calistenia/core/locales/es/translation.json'
import en from '@calistenia/core/locales/en/translation.json'
import { FEATURES, getFeature } from './features'

/** Se le exigen a todos los slugs, tengan página propia o plantilla. */
const SHARED_KEYS = ['name', 'card']
/**
 * Metadatos de buscador. Hoy solo existen en los slugs ya migrados a página
 * propia; al cerrar la épica #279 se suben a SHARED_KEYS para los nueve.
 */
const SEO_KEYS = ['metaTitle', 'metaDesc']
/** Contrato de la plantilla compartida: solo para los slugs sin página propia. */
const TEMPLATE_KEYS = ['eyebrow', 'title', 'lead', 'whatTitle', 'howNote', 's1', 's2', 's3']

describe('registro de funciones', () => {
  it('los slugs son únicos', () => {
    expect(new Set(FEATURES.map(f => f.slug)).size).toBe(FEATURES.length)
  })

  it('las funciones relacionadas existen y no se apuntan a sí mismas', () => {
    for (const feature of FEATURES) {
      for (const slug of feature.related) {
        expect(slug).not.toBe(feature.slug)
        expect(getFeature(slug), `${feature.slug} → ${slug}`).toBeDefined()
      }
    }
  })

  it('un slug con página propia no declara blocks ni faqs', () => {
    for (const feature of FEATURES.filter(f => f.Page)) {
      expect(feature.blocks, `${feature.slug}.blocks`).toBeUndefined()
      expect(feature.faqs, `${feature.slug}.faqs`).toBeUndefined()
    }
  })

  it('un slug sin página propia declara cuántos bloques y preguntas tiene', () => {
    for (const feature of FEATURES.filter(f => !f.Page)) {
      expect(feature.blocks, `${feature.slug}.blocks`).toBeGreaterThan(0)
      expect(feature.faqs, `${feature.slug}.faqs`).toBeGreaterThan(0)
    }
  })

  it.each(['es', 'en'])('%s tiene todos los textos de cada función', lang => {
    const dict = (lang === 'es' ? es : en) as Record<string, string>
    for (const feature of FEATURES) {
      const expected = [
        ...SHARED_KEYS,
        ...(feature.Page ? SEO_KEYS : TEMPLATE_KEYS),
        ...Array.from({ length: feature.blocks ?? 0 }, (_, i) => [`b${i + 1}t`, `b${i + 1}d`]).flat(),
        ...Array.from({ length: feature.faqs ?? 0 }, (_, i) => [`q${i + 1}`, `a${i + 1}`]).flat(),
      ]
      for (const key of expected) {
        expect(dict[`feature.${feature.slug}.${key}`], `${lang} feature.${feature.slug}.${key}`).toBeTruthy()
      }
    }
  })

  it('las claves feature.* existen en los dos idiomas y no están vacías', () => {
    const esDict = es as Record<string, string>
    const enDict = en as Record<string, string>
    const keys = new Set([...Object.keys(esDict), ...Object.keys(enDict)].filter(k => k.startsWith('feature.')))
    for (const key of keys) {
      expect(esDict[key], `es ${key}`).toBeTruthy()
      expect(enDict[key], `en ${key}`).toBeTruthy()
    }
  })

  it('los slugs migrados no conservan claves de la plantilla', () => {
    const esDict = es as Record<string, string>
    for (const feature of FEATURES.filter(f => f.Page)) {
      for (const key of [...TEMPLATE_KEYS.filter(k => k !== 'eyebrow'), 'b1t', 'q1']) {
        expect(esDict[`feature.${feature.slug}.${key}`], `feature.${feature.slug}.${key} debería estar borrada`).toBeUndefined()
      }
    }
  })

  it('el sitemap del build incluye las mismas funciones', () => {
    const script = fs.readFileSync(path.resolve(__dirname, '../../scripts/prerender-blog.mjs'), 'utf8')
    const block = script.match(/const FEATURE_SLUGS = \[([^\]]+)\]/)
    expect(block, 'FEATURE_SLUGS no encontrado en prerender-blog.mjs').not.toBeNull()
    const slugs = Array.from(block![1].matchAll(/'([a-z-]+)'/g), m => m[1])
    expect(slugs.sort()).toEqual(FEATURES.map(f => f.slug).sort())
  })
})
