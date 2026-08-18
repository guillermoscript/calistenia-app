import { describe, it, expect, beforeEach } from 'vitest'
import {
  buildCatalogIndex,
  loadCatalogIndex,
  primeCatalogIndex,
  getCatalogIndexSync,
  isCatalogIndexReady,
  __resetCatalogIndexForTests,
  type RawCatalog,
} from './catalogIndex'
import { resolveExerciseId } from './resolveExerciseId'
import { getCatalogEntry, getVariants, getAllCatalogEntries } from './variants'
import { getCatalogStaticMedia } from './catalogMedia'

// Catálogo de mentira: lo justo para ejercitar cada índice.
const FAKE: RawCatalog = {
  categories: {
    push: {
      exercises: [
        {
          id: 'pushup_std',
          seed_slug: 'push-up',
          name: { es: 'Flexiones', en: 'Push-up' },
          family: 'push_up',
          difficulty: 'beginner',
          media: { sequence: '/m/pushup.png' },
          slug: 'flexiones',
        },
        {
          id: 'pushup_diamond',
          name: { es: 'Flexiones diamante', en: 'Diamond push-up' },
          family: 'push_up',
          difficulty: 'advanced',
        },
        // Mismo nombre normalizado que la siguiente entrada → ambiguo.
        { id: 'dup_a', name: { es: 'Repetido' } },
      ],
    },
    pull: {
      exercises: [
        { id: 'dup_b', name: { es: 'repetido' } },
        { id: 'pullup', name: { es: 'Dominadas', en: 'Pull-up' }, difficulty: 'intermediate' },
      ],
    },
  },
}

describe('buildCatalogIndex', () => {
  const index = buildCatalogIndex(FAKE)

  it('aplana en el orden de las categorías del fichero', () => {
    expect(index.categories).toEqual(['push', 'pull'])
    expect(index.all.map(e => e.id)).toEqual([
      'pushup_std', 'pushup_diamond', 'dup_a', 'dup_b', 'pullup',
    ])
  })

  it('indexa por id y por familia en un solo recorrido', () => {
    expect(index.byId.get('pullup')?.name).toEqual({ es: 'Dominadas', en: 'Pull-up' })
    expect(index.byFamily.get('push_up')?.map(e => e.id)).toEqual(['pushup_std', 'pushup_diamond'])
    expect(index.ids.has('dup_a')).toBe(true)
  })

  it('mapea seed_slug al id canónico', () => {
    expect(index.bySeedSlug.get('push-up')).toBe('pushup_std')
  })

  it('indexa nombres normalizados en los dos idiomas, sin acentos', () => {
    expect(index.byName.get('flexiones')).toBe('pushup_std')
    expect(index.byName.get('push-up')).toBe('pushup_std')
    expect(index.byName.get('dominadas')).toBe('pullup')
  })

  it('NO indexa un nombre que apunta a dos ids distintos', () => {
    // Resolver esto mal fusionaría historiales de series distintos.
    expect(index.byName.has('repetido')).toBe(false)
  })

  it('indexa la media por id, seed_slug y slug, y sólo de quien la tiene', () => {
    expect(index.mediaByKey.get('pushup_std')).toEqual({ sequence: '/m/pushup.png' })
    expect(index.mediaByKey.get('push-up')).toEqual({ sequence: '/m/pushup.png' })
    expect(index.mediaByKey.get('flexiones')).toEqual({ sequence: '/m/pushup.png' })
    expect(index.mediaByKey.has('pushup_diamond')).toBe(false)
  })

  it('es pura: no toca el índice del módulo', () => {
    // `vitest.setup.ts` ya primó el catálogo de verdad; construir uno falso no
    // debe haberlo sustituido.
    expect(getCatalogIndexSync()?.all.length).toBeGreaterThan(1000)
  })
})

describe('primeCatalogIndex', () => {
  it('la primera llamada gana — un prime tardío no reconstruye lo que ya se usa', () => {
    const first = getCatalogIndexSync()
    expect(first).not.toBeNull()
    expect(primeCatalogIndex(FAKE)).toBe(first)
  })
})

describe('la ventana previa a la carga', () => {
  beforeEach(() => {
    __resetCatalogIndexForTests()
  })

  it('sin índice, cada API cae a su fallback documentado', () => {
    expect(isCatalogIndexReady()).toBe(false)
    // Paso 4 de resolveExerciseId: devuelve la entrada intacta, no adivina.
    expect(resolveExerciseId('jumping-jacks')).toBe('jumping-jacks')
    expect(getCatalogEntry('pushup_std')).toBeUndefined()
    expect(getVariants('pushup_std')).toEqual([])
    expect(getAllCatalogEntries()).toEqual([])
    expect(getCatalogStaticMedia('pushup_std')).toBeUndefined()
  })

  it('tras loadCatalogIndex() las mismas llamadas ya resuelven', async () => {
    // Aquí entra el catálogo de verdad, no el falso de arriba.
    await loadCatalogIndex()
    expect(isCatalogIndexReady()).toBe(true)
    expect(resolveExerciseId('jumping-jacks')).toBe('jumping_jacks')
    expect(getCatalogEntry('pushup_std')).toBeDefined()
    expect(getVariants('pushup_std').length).toBeGreaterThan(0)
  })

  it('loadCatalogIndex() es memoizada — dos llamadas dan el mismo objeto', async () => {
    const [a, b] = await Promise.all([loadCatalogIndex(), loadCatalogIndex()])
    expect(a).toBe(b)
    expect(a).toBe(getCatalogIndexSync())
  })
})
