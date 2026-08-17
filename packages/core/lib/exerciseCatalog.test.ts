import { describe, it, expect } from 'vitest'
import { mapCatalogRecord } from './exerciseCatalog'

/**
 * `exercises_catalog` tiene un campo `difficulty_level` desde la migración
 * `1774378000_add_difficulty_level_to_exercises_catalog.js`. La copia del mapper
 * que vive en `ExerciseLibraryPage.tsx:269` lo lee; la de
 * `ExerciseDetailPage.tsx:210-228` no, y su tipo `CatalogExercise` ni siquiera
 * declara el campo — así que en la página de detalle el dato se pierde en
 * silencio. Este test falla contra esa lógica (#474).
 */
describe('mapCatalogRecord — difficulty (regresión #474)', () => {
  it('conserva difficulty_level del registro de PocketBase', () => {
    const mapped = mapCatalogRecord({
      id: 'pb_rand_id_0001',
      slug: 'pull_ups',
      name: { es: 'Dominadas', en: 'Pull-ups' },
      difficulty_level: 'advanced',
    })

    expect(mapped.difficulty).toBe('advanced')
  })

  it('deja difficulty sin definir cuando el registro no lo trae', () => {
    const mapped = mapCatalogRecord({ id: 'x', slug: 'x', name: 'X' })

    expect(mapped.difficulty).toBeUndefined()
  })
})
