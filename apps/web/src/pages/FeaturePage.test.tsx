import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// Solo se necesita t()/i18n.language — sin backend de i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'es' },
  }),
}))

vi.mock('@calistenia/core/lib/analytics', () => ({ op: { track: vi.fn() } }))

import FeaturePage from './FeaturePage'
import FeaturesPage from './FeaturesPage'
import { FEATURES } from '../data/features'

class MockIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    setTimeout(() => callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver), 0)
  }
  observe() {}
  disconnect() {}
  unobserve() {}
}
window.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/features/:slug" element={<FeaturePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

// Este fichero probaba la PLANTILLA compartida con el último slug que seguía
// sin página propia. Al migrar `challenges` (#286) se cerró la épica #279 y ya
// no queda ninguno: cada slug tiene su test en src/pages/features/, y aquí solo
// se prueba lo que sigue siendo del resolutor — el slug desconocido.
//
// La rama de plantilla de `FeaturePage.tsx` queda sin ningún slug que la use.
// Retirarla (junto con `FeatureDef.Visual`, `blocks` y `faqs`) es una limpieza
// aparte: toca el registro, los paneles y la landing, y no entra en #286.
describe('FeaturePage', () => {
  it('cada slug del registro resuelve a su propia página', () => {
    // El contrato del resolutor: si hay `Page`, se renderiza esa y no la
    // plantilla. Comprobarlo aquí evita que una migración se quede a medias.
    for (const feature of FEATURES) expect(feature.Page, feature.slug).toBeDefined()
  })

  it('un slug desconocido cae en el índice de funciones', () => {
    renderAt('/features/no-existe')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('feature.indexTitle')
  })
})

describe('FeaturesPage', () => {
  it('lista todas las funciones con enlace a su página', () => {
    renderAt('/features')
    for (const feature of FEATURES) {
      const heading = screen.getByRole('heading', { level: 2, name: `feature.${feature.slug}.name` })
      expect(heading.closest('a')).toHaveAttribute('href', `/features/${feature.slug}`)
    }
  })
})
