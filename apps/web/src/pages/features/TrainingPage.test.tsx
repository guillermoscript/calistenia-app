import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// Solo se necesita t()/i18n.language — sin backend de i18next.
// `t` es la identidad, así que los asserts comparan CLAVES, no textos.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'es' },
  }),
}))

const track = vi.fn()
vi.mock('@calistenia/core/lib/analytics', () => ({ op: { track: (...args: unknown[]) => track(...args) } }))

import TrainingPage from './TrainingPage'
import FeaturesPage from '../FeaturesPage'

class MockIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    setTimeout(() => callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver), 0)
  }
  observe() {}
  disconnect() {}
  unobserve() {}
}
window.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/features/training']}>
      <Routes>
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/features/:slug" element={<TrainingPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('TrainingPage', () => {
  it('muestra un único h1 con el titular propio de entrenamiento', () => {
    renderPage()
    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('feature.training.h1')
  })

  it('recorre las cinco fases de una sesión en orden', () => {
    renderPage()
    const badges = [1, 2, 3, 4, 5].map(n => screen.getByText(`feature.training.sess${n}Badge`))
    // El orden en el DOM importa: la sección cuenta una máquina de estados.
    for (let i = 1; i < badges.length; i++) {
      expect(badges[i - 1].compareDocumentPosition(badges[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    for (const n of [1, 2, 3, 4, 5]) {
      expect(screen.getByText(`feature.training.sess${n}Title`)).toBeInTheDocument()
      expect(screen.getByText(`feature.training.sess${n}Actions`)).toBeInTheDocument()
    }
  })

  it('publica las siete cifras del catálogo con su significado', () => {
    renderPage()
    for (const n of [1, 2, 3, 4, 5, 6, 7]) {
      expect(screen.getByText(`feature.training.cat${n}Figure`)).toBeInTheDocument()
      expect(screen.getByText(`feature.training.cat${n}Desc`)).toBeInTheDocument()
    }
  })

  it('explica los dos mecanismos de progresión y declara su límite', () => {
    renderPage()
    expect(screen.getByText('feature.training.prog1Title')).toBeInTheDocument()
    expect(screen.getByText('feature.training.prog2Title')).toBeInTheDocument()
    // El límite es el que evita prometer que la cadena avisa dentro de un programa oficial.
    expect(screen.getByText('feature.training.progLimit')).toBeInTheDocument()
    // La escalera de reps, con sus cuatro escalones.
    for (const n of [1, 2, 3, 4]) {
      // `getAllByText`: los nombres de escalón se repiten en el mock de la cadena.
      expect(screen.getAllByText(`feature.training.prog${n}Step`).length).toBeGreaterThan(0)
      expect(screen.getByText(`feature.training.prog${n}Reps`)).toBeInTheDocument()
    }
  })

  it('marca las capacidades que solo están en una plataforma', () => {
    renderPage()
    // plat5 (notificación) y plat6 (catálogo sin conexión) son solo de Android…
    for (const key of ['plat5', 'plat6']) {
      const cells = screen.getByRole('row', { name: new RegExp(`feature\\.training\\.${key}`) }).querySelectorAll('td')
      expect(cells).toHaveLength(3)
      expect(cells[0]).toHaveTextContent('feature.platformNo')
      expect(cells[1]).toHaveTextContent('feature.platformYes')
      expect(cells[2]).toHaveTextContent('feature.platformNo')
    }
    // …y plat9 (registro con fecha pasada) solo de la web.
    const past = screen.getByRole('row', { name: /feature\.training\.plat9/ }).querySelectorAll('td')
    expect(past[0]).toHaveTextContent('feature.platformYes')
    expect(past[1]).toHaveTextContent('feature.platformNo')
    expect(past[2]).toHaveTextContent('feature.platformNo')
  })

  it('publica las seis preguntas frecuentes y su JSON-LD', () => {
    renderPage()
    for (const n of [1, 2, 3, 4, 5, 6]) expect(screen.getByText(`feature.training.faq${n}q`)).toBeInTheDocument()
    const script = document.querySelector('script[type="application/ld+json"]')
    expect(script).not.toBeNull()
    const data = JSON.parse(script!.innerHTML)
    expect(data['@type']).toBe('FAQPage')
    expect(data.mainEntity).toHaveLength(6)
    expect(data.mainEntity[0].name).toBe('feature.training.faq1q')
    expect(data.mainEntity[0].acceptedAnswer.text).toBe('feature.training.faq1a')
  })

  it('ofrece volver al índice y todos los enlaces de Android apuntan a /download', () => {
    renderPage()
    expect(screen.getAllByRole('link', { name: /feature\.allFeatures/ })[0]).toHaveAttribute('href', '/features')
    const androidLinks = screen.getAllByRole('link', { name: /landing\.androidCta/ })
    expect(androidLinks.length).toBeGreaterThan(0)
    for (const link of androidLinks) expect(link).toHaveAttribute('href', '/download')
  })

  it('enlaza a progreso, circuitos y offline desde el cuerpo y desde las relacionadas', () => {
    renderPage()
    for (const slug of ['progress', 'circuits', 'offline']) {
      const links = screen.getAllByRole('link').filter(a => a.getAttribute('href') === `/features/${slug}`)
      expect(links.length, `enlaces a /features/${slug}`).toBeGreaterThanOrEqual(2)
    }
  })

  it('registra la vista de la página una sola vez', () => {
    track.mockClear()
    renderPage()
    const views = track.mock.calls.filter(([event]) => event === 'feature_page_viewed')
    expect(views).toHaveLength(1)
    expect(views[0][1]).toEqual({ feature: 'training' })
  })

  it('no repite las afirmaciones falsas de la plantilla', () => {
    renderPage()
    // `b3t` prometía 1.578 ejercicios "con progresiones" (son 263) y `b3d`
    // hablaba de imágenes (hay 8). `s1`/`howNote` preguntaban por tu equipo,
    // cosa que el onboarding no hace. Si alguien las reintroduce, esto lo caza.
    for (const key of ['b3t', 'b3d', 's1', 'howNote', 'lead', 'title']) {
      expect(screen.queryByText(`feature.training.${key}`), key).toBeNull()
    }
  })
})
