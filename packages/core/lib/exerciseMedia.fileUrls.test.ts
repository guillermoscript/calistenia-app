/**
 * #608 — construcción de URLs de fichero en el resolutor.
 *
 * `demo_images` / `default_images` guardan el NOMBRE DE FICHERO que devuelve
 * PocketBase, no una URL. Cuatro sitios de la web lo metían tal cual en un `src`,
 * así que el navegador lo resolvía contra la URL de la página → imagen rota.
 *
 * Los mismos campos también llevan valores que YA son direccionables (las
 * imágenes de wger del catálogo empaquetado, las rutas de `/exercise-media/…`),
 * y esos tienen que salir intactos: pasarlos por el constructor de URLs de PB
 * rompería el único camino de media que hoy funciona.
 */
import { describe, it, expect } from 'vitest'
import { getExerciseMedia } from './exerciseMedia'

const PB = 'https://gym.guille.tech'

describe('getExerciseMedia — nombre de fichero crudo → URL /api/files/', () => {
  it('resuelve el override de un program_exercise contra program_exercises', () => {
    // Mismos valores que el registro sembrado en PB local para reproducir el bug.
    const media = getExerciseMedia({
      pbRecordId: 'cz4epuu6l5koz69',
      demoImages: ['demo608_fcc6oxlivs.png'],
      youtube: 'push up',
    })

    expect(media.source).toBe('program')
    expect(media.images[0]).toBe('/api/files/program_exercises/cz4epuu6l5koz69/demo608_fcc6oxlivs.png')
    // Lo que pedía el issue: lo que acabe en un `src` empieza por /api/files/
    expect(media.thumbnail?.startsWith('/api/files/')).toBe(true)
    expect(media.sequence?.startsWith('/api/files/')).toBe(true)
  })

  it('resuelve los ficheros del catálogo contra exercises_catalog, no contra program_exercises', () => {
    const media = getExerciseMedia(
      { youtube: 'pull up' },
      { catalogRecord: { pbRecordId: 'cat_abc123', defaultImages: ['pullup.png'], defaultVideo: 'pullup.mp4' } },
    )

    expect(media.source).toBe('catalog')
    expect(media.images[0]).toBe('/api/files/exercises_catalog/cat_abc123/pullup.png')
    expect(media.video).toBe('/api/files/exercises_catalog/cat_abc123/pullup.mp4')
  })

  it('antepone pbBaseUrl cuando no hay mismo origen (móvil)', () => {
    const media = getExerciseMedia(
      { pbRecordId: 'pe_1', demoImages: ['a.png'], youtube: 'x' },
      { pbBaseUrl: PB },
    )
    expect(media.images[0]).toBe(`${PB}/api/files/program_exercises/pe_1/a.png`)
  })
})

describe('getExerciseMedia — lo que ya es URL pasa intacto (#608)', () => {
  const wger = 'https://wger.de/media/exercise-images/129/Standing-biceps-curl-1.png'

  it('deja intacta una URL absoluta del catálogo empaquetado', () => {
    const media = getExerciseMedia(
      { youtube: 'curl' },
      { catalogRecord: { pbRecordId: 'cat_x', defaultImages: [wger] } },
    )

    // Sin el guardia saldría "/api/files/exercises_catalog/cat_x/https://wger.de/…"
    expect(media.images[0]).toBe(wger)
    expect(media.images[0]).not.toContain('/api/files/')
  })

  it('deja intacta una URL absoluta aunque haya pbBaseUrl', () => {
    const media = getExerciseMedia(
      { pbRecordId: 'pe_9', demoImages: [wger], youtube: 'x' },
      { pbBaseUrl: PB },
    )
    expect(media.images[0]).toBe(wger)
  })

  it('deja intacta una ruta relativa al origen (/exercise-media/…)', () => {
    const path = '/exercise-media/strict-pull-up/sequence.webp'
    const media = getExerciseMedia({ pbRecordId: 'pe_2', demoImages: [path], youtube: 'x' })
    expect(media.images[0]).toBe(path)
  })

  it('mezcla nombre crudo y URL absoluta resolviendo solo el crudo', () => {
    const media = getExerciseMedia({
      pbRecordId: 'pe_3',
      demoImages: ['crudo.png', wger],
      youtube: 'x',
    })
    expect(media.images).toEqual(['/api/files/program_exercises/pe_3/crudo.png', wger])
  })

  it('aplica el mismo criterio al vídeo', () => {
    const url = 'https://cdn.example.com/demo.mp4'
    expect(getExerciseMedia({ pbRecordId: 'pe_4', demoVideo: url, youtube: 'x' }).video).toBe(url)
    expect(getExerciseMedia({ pbRecordId: 'pe_4', demoVideo: 'v.mp4', youtube: 'x' }).video)
      .toBe('/api/files/program_exercises/pe_4/v.mp4')
  })
})

describe('el botón de media ya no depende de demoImages (#608)', () => {
  // Antes la condición era `demoImages.length > 0`, así que un ejercicio que solo
  // tuviera media estática del catálogo escondía el botón aunque `MediaViewer`
  // sí tenía algo que pintar. Esto fija el caso que destapaba ese fallo.
  it('un ejercicio sin demoImages pero con media estática resuelve media igualmente', () => {
    const media = getExerciseMedia(
      { pbRecordId: 'pe_sin_ficheros', demoImages: [], demoVideo: '', youtube: 'pull up' },
      {
        catalogRecord: {
          staticMedia: {
            sequence: '/exercise-media/strict-pull-up/sequence.webp',
            muscles: '/exercise-media/strict-pull-up/muscles.webp',
            thumbnail: '/exercise-media/strict-pull-up/thumbnail.webp',
          },
        },
      },
    )

    expect(media.source).toBe('catalog')
    expect(media.sequence).toBe('/exercise-media/strict-pull-up/sequence.webp')
    expect(media.thumbnail).toBe('/exercise-media/strict-pull-up/thumbnail.webp')
    // La condición nueva del botón mira esto, no `demoImages`.
    expect(media.images.length).toBeGreaterThan(0)
  })

  it('sin nada que resolver no hay media (el botón sigue escondido)', () => {
    const media = getExerciseMedia({ youtube: 'squat' })
    expect(media.source).toBe('none')
    expect(media.images).toEqual([])
    expect(media.sequence).toBeNull()
    expect(media.thumbnail).toBeNull()
    expect(media.video).toBeNull()
    // YouTube sigue disponible: es la capa (d), y no pinta miniatura.
    expect(media.youtubeUrl).toContain('youtube.com')
  })
})
