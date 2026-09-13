import { describe, it, expect } from 'vitest'
import { isMarketingPath, localizedWebUrl, WEB_BASE_URL } from './app-urls'

describe('WEB_BASE_URL', () => {
  it('es el origen de producción', () => {
    expect(WEB_BASE_URL).toBe('https://gym.guille.tech')
  })

  it('no termina en barra: todos los builders le concatenan "/algo"', () => {
    // Con barra final saldrían enlaces "https://…//invite/abc", que se comparten
    // igual y fallan raro. Es el único invariante que el resto del código asume.
    expect(WEB_BASE_URL.endsWith('/')).toBe(false)
  })

  it('antepone el idioma al enlace público', () => {
    expect(localizedWebUrl('/features/training', 'en-US')).toBe(`${WEB_BASE_URL}/en/features/training`)
    expect(localizedWebUrl('/features/training', 'es-ES')).toBe(`${WEB_BASE_URL}/es/features/training`)
    expect(localizedWebUrl('/', 'en')).toBe(`${WEB_BASE_URL}/en/`)
    expect(localizedWebUrl('/download')).toBe(`${WEB_BASE_URL}/es/download`)
  })

  // Los App Links de Android e iOS casan con `/invite`, `/race`, `/u`,
  // `/session`: con `/es/` delante el enlace ya no abre la app instalada, y el
  // hook de vista previa de carreras deja de reconocer la URL.
  it('NO antepone el idioma a las rutas de la app', () => {
    for (const path of ['/invite/abc', '/invite/abc/challenge/c1', '/u/u1', '/race/r1', '/session/2026-09-13/p1_lun', '/shared/p1', '/cardio/session/c1', '/challenges', '/nutrition?date=2026-09-13', '/s/w1']) {
      expect(localizedWebUrl(path, 'en')).toBe(`${WEB_BASE_URL}${path}`)
    }
  })
})

describe('isMarketingPath', () => {
  it('reconoce las rutas de marketing con o sin idioma, query o hash', () => {
    for (const path of ['/', '/features', '/features/training', '/download', '/descargar', '/en', '/es/', '/en/features/nutrition', '/?utm_source=x', '/download#top']) {
      expect(isMarketingPath(path)).toBe(true)
    }
  })

  it('no confunde rutas de la app ni prefijos parecidos', () => {
    for (const path of ['/invite/abc', '/race/r1', '/u/u1', '/featuresx', '/english', '/es/invite/abc']) {
      expect(isMarketingPath(path)).toBe(false)
    }
  })
})
