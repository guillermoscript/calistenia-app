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

describe('FeaturePage', () => {
  it('renderiza el detalle completo de la función', () => {
    renderAt('/features/training')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('feature.training.title')
    // 4 bloques "qué incluye"
    for (const n of [1, 2, 3, 4]) expect(screen.getByText(`feature.training.b${n}t`)).toBeInTheDocument()
    // 3 pasos + 3 preguntas
    for (const n of [1, 2, 3]) {
      expect(screen.getByText(`feature.training.s${n}`)).toBeInTheDocument()
      expect(screen.getByText(`feature.training.q${n}`)).toBeInTheDocument()
      expect(screen.getByText(`feature.training.a${n}`)).toBeInTheDocument()
    }
  })

  it('enlaza a las funciones relacionadas declaradas', () => {
    renderAt('/features/training')
    for (const slug of ['progress', 'circuits', 'offline']) {
      // Aparecen en la tarjeta de "sigue explorando" y en el índice del pie
      const links = screen.getAllByRole('link', { name: new RegExp(`feature\\.${slug}\\.name`) })
      expect(links.length).toBeGreaterThanOrEqual(2)
      for (const link of links) expect(link).toHaveAttribute('href', `/features/${slug}`)
    }
  })

  it('ofrece volver al índice y descargar la app', () => {
    renderAt('/features/cardio')
    expect(screen.getAllByRole('link', { name: /feature\.allFeatures/ })[0]).toHaveAttribute('href', '/features')
    for (const link of screen.getAllByRole('link', { name: /landing\.androidCta/ })) {
      expect(link).toHaveAttribute('href', '/download')
    }
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
