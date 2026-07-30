import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import es from '@calistenia/core/locales/es/translation.json'
import en from '@calistenia/core/locales/en/translation.json'
import { FEATURES, getFeature } from './features'

const KEYS = ['name', 'eyebrow', 'title', 'lead', 'card', 'whatTitle', 'howNote', 's1', 's2', 's3']

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

  it.each(['es', 'en'])('%s tiene todos los textos de cada función', lang => {
    const dict = (lang === 'es' ? es : en) as Record<string, string>
    for (const feature of FEATURES) {
      const expected = [
        ...KEYS,
        ...Array.from({ length: feature.blocks }, (_, i) => [`b${i + 1}t`, `b${i + 1}d`]).flat(),
        ...Array.from({ length: feature.faqs }, (_, i) => [`q${i + 1}`, `a${i + 1}`]).flat(),
      ]
      for (const key of expected) {
        expect(dict[`feature.${feature.slug}.${key}`], `${lang} feature.${feature.slug}.${key}`).toBeTruthy()
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
