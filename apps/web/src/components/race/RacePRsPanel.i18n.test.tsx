import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'

// Guardarraíl del issue #560.
//
// El bug: `race.prsTitle`, `race.prsWins`, `race.prsFinished` y
// `race.prsLongest` pasaban por `t()` correctamente, pero el **valor guardado
// en el locale español estaba en inglés**, así que el panel se leía
// «RECORDS DE RACE · 2 WINS · 2 FINISHED» sobre una interfaz en español.
//
// Por eso este test NO mockea `react-i18next`: inicializa el i18n real de la
// app (`src/lib/i18n`, que carga los JSON de `packages/core/locales`) y fuerza
// el idioma a `es`. Mockearlo devolvería la clave y el test pasaría con el
// locale roto — que es exactamente el fallo que se quiere cazar.

vi.mock('@calistenia/core/hooks/useRacePRs', () => ({
  useRacePRs: () => ({
    loading: false,
    prs: {
      wins: 2,
      finishes: 2,
      best1k: null,
      best5k: null,
      best10k: null,
      fastestRace: null,
      longestRace: { name: 'Carrera de prueba', distanceKm: 5 },
    },
  }),
}))

import i18n from '../../lib/i18n'
import RacePRsPanel from './RacePRsPanel'

beforeAll(async () => {
  // El LanguageDetector mira `navigator.language`, que en jsdom es inglés.
  await i18n.changeLanguage('es')
})

describe('RacePRsPanel en español (#560)', () => {
  it('muestra el panel de récords traducido, sin restos en inglés', () => {
    const { container } = render(<RacePRsPanel userId="u1" />)

    // `race.prsTitle` se pone en mayúsculas por CSS, así que el texto del DOM
    // conserva los acentos; `prsWins`/`prsFinished` sí pasan por
    // `.toUpperCase()` en el JSX.
    expect(screen.getByText('Récords de carrera')).toBeInTheDocument()
    expect(screen.getByText(/2 VICTORIAS/)).toBeInTheDocument()
    expect(screen.getByText(/2 TERMINADAS/)).toBeInTheDocument()
    expect(screen.getByText('📏 Carrera más larga')).toBeInTheDocument()

    // Los valores en inglés que reportaba el issue no deben volver. Se
    // comprueba sobre el texto completo del panel para que reaparezcan como
    // fallo aunque cambie el marcado.
    const text = container.textContent ?? ''
    for (const ingles of ['WINS', 'FINISHED', 'Records de Race', 'Race más larga']) {
      expect(text).not.toContain(ingles)
    }
  })
})
