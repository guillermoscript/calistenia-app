import { describe, it, expect } from 'vitest'
import { getCatalogStaticMedia } from './catalogMedia'

// Estos tests usan el catálogo bundleado real (../data/exercise-catalog.json), tal como lo
// hace el módulo en producción (indexa el JSON al importarse). Hoy solo el ejercicio
// "strict pull-up" (id: pullup_strict, seed_slug: strict-pull-up) tiene media estructurada
// en el catálogo bundleado.

describe('getCatalogStaticMedia', () => {
  it('resuelve la media estática por el id canónico del catálogo', () => {
    const media = getCatalogStaticMedia('pullup_strict')
    expect(media).toBeDefined()
    expect(media?.sequence).toBe('/exercise-media/strict-pull-up/sequence.webp')
    expect(media?.muscles).toBe('/exercise-media/strict-pull-up/muscles.webp')
    expect(media?.thumbnail).toBe('/exercise-media/strict-pull-up/thumbnail.webp')
  })

  it('resuelve la misma media por el seed_slug (índice secundario)', () => {
    const bySlug = getCatalogStaticMedia('strict-pull-up')
    const byId = getCatalogStaticMedia('pullup_strict')
    expect(bySlug).toBeDefined()
    // ambos identificadores apuntan al mismo objeto media indexado
    expect(bySlug).toBe(byId)
  })

  it('devuelve undefined para un id que existe en el catálogo pero sin media estructurada', () => {
    // ab_wheel_rollout existe en el catálogo bundleado pero no tiene sequence/muscles/thumbnail/video
    expect(getCatalogStaticMedia('ab_wheel_rollout')).toBeUndefined()
  })

  it('devuelve undefined para un id que no existe en absoluto', () => {
    expect(getCatalogStaticMedia('id-inventado-que-no-existe')).toBeUndefined()
  })

  it('devuelve undefined cuando no se pasa ningún argumento', () => {
    expect(getCatalogStaticMedia(undefined)).toBeUndefined()
    expect(getCatalogStaticMedia()).toBeUndefined()
  })

  it('devuelve undefined para string vacío (idOrSlug falsy)', () => {
    expect(getCatalogStaticMedia('')).toBeUndefined()
  })
})
