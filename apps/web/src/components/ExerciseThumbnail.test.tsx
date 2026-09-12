/**
 * #608 — la miniatura nunca puede pintar el nombre de fichero crudo de PocketBase.
 *
 * Es la comprobación que pedía el issue: con un `program_exercise` que tenga
 * `demo_images`, el `src` que llega al DOM tiene que empezar por `/api/files/`.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ExerciseThumbnail from './ExerciseThumbnail'

describe('ExerciseThumbnail (#608)', () => {
  it('pinta el override de un program_exercise como URL /api/files/', () => {
    render(
      <ExerciseThumbnail
        exercise={{
          id: 'pushup_std',
          pbRecordId: 'cz4epuu6l5koz69',
          demoImages: ['demo608_fcc6oxlivs.png'],
          youtube: 'push up',
        }}
        alt="Flexiones"
      />,
    )

    const img = screen.getByAltText('Flexiones') as HTMLImageElement
    expect(img.getAttribute('src')).toBe(
      '/api/files/program_exercises/cz4epuu6l5koz69/demo608_fcc6oxlivs.png',
    )
    expect(img.getAttribute('src')!.startsWith('/api/files/')).toBe(true)
    // El nombre pelado ya no puede llegar al DOM: sería relativo a la página.
    expect(img.getAttribute('src')).not.toBe('demo608_fcc6oxlivs.png')
  })

  it('resuelve los ficheros del catálogo contra exercises_catalog', () => {
    render(
      <ExerciseThumbnail
        exercise={{ id: 'pb_random_id', youtube: 'pull up' }}
        catalogKey="pullup_strict"
        catalogRecord={{ pbRecordId: 'pb_random_id', defaultImages: ['pullup.png'] }}
        alt="Dominadas"
      />,
    )

    const img = screen.getByAltText('Dominadas') as HTMLImageElement
    expect(img.getAttribute('src')).toBe('/api/files/exercises_catalog/pb_random_id/pullup.png')
  })

  it('deja intacta la URL absoluta que trae el catálogo empaquetado', () => {
    const wger = 'https://wger.de/media/exercise-images/129/Standing-biceps-curl-1.png'
    render(
      <ExerciseThumbnail
        exercise={{ id: 'biceps_curl_cable', youtube: 'curl' }}
        catalogRecord={{ pbRecordId: 'biceps_curl_cable', defaultImages: [wger] }}
        alt="Curl"
      />,
    )

    expect(screen.getByAltText('Curl').getAttribute('src')).toBe(wger)
  })

  it('pinta el fallback cuando no hay media que resolver', () => {
    render(
      <ExerciseThumbnail
        exercise={{ id: 'sin_media', youtube: 'squat' }}
        alt="Sentadillas"
        fallback={<div data-testid="placeholder" />}
      />,
    )

    expect(screen.queryByAltText('Sentadillas')).toBeNull()
    expect(screen.getByTestId('placeholder')).toBeTruthy()
  })
})
