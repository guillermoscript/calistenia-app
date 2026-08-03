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

import ChallengesPage from './ChallengesPage'
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
    <MemoryRouter initialEntries={['/features/challenges']}>
      <Routes>
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/features/:slug" element={<ChallengesPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ChallengesPage', () => {
  it('muestra un único h1 con el titular propio de retos', () => {
    renderPage()
    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('feature.challenges.h1')
  })

  it('publica las seis filas de métricas con su unidad', () => {
    renderPage()
    for (const n of [1, 2, 3, 4, 5, 6]) {
      expect(screen.getByText(`feature.challenges.met${n}What`)).toBeInTheDocument()
      expect(screen.getByText(`feature.challenges.met${n}Unit`)).toBeInTheDocument()
      expect(screen.getByText(`feature.challenges.met${n}Counts`)).toBeInTheDocument()
    }
  })

  it('avisa de que las marcas personales no miran el plazo', () => {
    renderPage()
    // Es la diferencia entre un reto justo y uno que gana quien ya tenía la
    // marca: `getScore` lee `settings.pr_*`, sin filtrar por fechas.
    const note = screen.getByText(/feature\.challenges\.metNote/)
    expect(note).toBeInTheDocument()
    // El marcador de enlace nunca puede llegar crudo a la pantalla.
    expect(note.textContent).not.toContain('{{link}}')
    expect(note.querySelector('a')).toHaveAttribute('href', '/features/progress')
  })

  it('compara reto con carrera y enlaza a /features/races', () => {
    renderPage()
    for (const n of [1, 2, 3, 4, 5]) {
      expect(screen.getByText(`feature.challenges.vs${n}Aspect`)).toBeInTheDocument()
      expect(screen.getByText(`feature.challenges.vs${n}Challenge`)).toBeInTheDocument()
      expect(screen.getByText(`feature.challenges.vs${n}Race`)).toBeInTheDocument()
    }
    const links = screen.getAllByRole('link').filter(a => a.getAttribute('href') === '/features/races')
    expect(links.length).toBeGreaterThanOrEqual(2)
  })

  it('dice qué falta todavía sin prometer fechas', () => {
    renderPage()
    expect(screen.getByText('feature.challenges.todayNextTitle')).toBeInTheDocument()
    for (const n of [1, 2]) expect(screen.getByText(`feature.challenges.todayNext${n}`)).toBeInTheDocument()
    const limit = screen.getByText(/feature\.challenges\.todayLimit/)
    expect(limit.textContent).not.toContain('{{link}}')
    expect(limit.querySelector('a')).toHaveAttribute('href', '/features/races')
  })

  it('no promete invitar a nadie', () => {
    renderPage()
    // Guardarraíl contra reintroducir el copy viejo: `b2t`/`b2d` decían "invita
    // a quien quieras" y la regla de la API lo impide; `b3d` prometía una barra
    // de progreso que no existe; `howNote`/`a2` daban Android por completo.
    for (const key of ['b1d', 'b2t', 'b2d', 'b3d', 's2', 'a2', 'title', 'lead', 'whatTitle', 'howNote']) {
      expect(screen.queryByText(`feature.challenges.${key}`), key).toBeNull()
    }
  })

  it('marca como solo-web crear el reto y ver la clasificación', () => {
    renderPage()
    // La pantalla nativa es solo la lista: no hay detalle, ni ranking, ni crear.
    for (const key of ['plat2', 'plat3', 'plat4']) {
      const cells = screen.getByRole('row', { name: new RegExp(`feature\\.challenges\\.${key}`) }).querySelectorAll('td')
      expect(cells, key).toHaveLength(3)
      expect(cells[0], key).toHaveTextContent('feature.platformYes')
      expect(cells[1], key).toHaveTextContent('feature.platformNo')
      expect(cells[2], key).toHaveTextContent('feature.platformNo')
    }
  })

  it('no marca ninguna capacidad en iOS: no hay descarga publicada', () => {
    renderPage()
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const cells = screen.getByRole('row', { name: new RegExp(`feature\\.challenges\\.plat${n}(\\s|$)`) }).querySelectorAll('td')
      expect(cells[2], `plat${n}`).toHaveTextContent('feature.platformNo')
    }
    expect(screen.getByText('feature.challenges.platNote')).toBeInTheDocument()
  })

  it('publica las seis preguntas frecuentes y su JSON-LD', () => {
    renderPage()
    for (const n of [1, 2, 3, 4, 5, 6]) expect(screen.getByText(`feature.challenges.faq${n}q`)).toBeInTheDocument()
    const script = document.querySelector('script[type="application/ld+json"]')
    expect(script).not.toBeNull()
    const data = JSON.parse(script!.innerHTML)
    expect(data['@type']).toBe('FAQPage')
    expect(data.mainEntity).toHaveLength(6)
    expect(data.mainEntity[0].name).toBe('feature.challenges.faq1q')
    for (const entry of data.mainEntity) expect(entry.acceptedAnswer.text).not.toContain('{{link}}')
  })

  it('ofrece volver al índice y descargar la app', () => {
    renderPage()
    expect(screen.getAllByRole('link', { name: /feature\.allFeatures/ })[0]).toHaveAttribute('href', '/features')
    const androidLinks = screen.getAllByRole('link', { name: /landing\.androidCta/ })
    expect(androidLinks.length).toBeGreaterThan(0)
    for (const link of androidLinks) expect(link).toHaveAttribute('href', '/download')
  })

  it('enlaza a las tres funciones relacionadas', () => {
    renderPage()
    for (const slug of ['community', 'progress', 'races']) {
      const links = screen.getAllByRole('link').filter(a => a.getAttribute('href') === `/features/${slug}`)
      expect(links.length, `enlaces a /features/${slug}`).toBeGreaterThanOrEqual(2)
    }
  })

  it('registra la vista de la página una sola vez', () => {
    track.mockClear()
    renderPage()
    const views = track.mock.calls.filter(([event]) => event === 'feature_page_viewed')
    expect(views).toHaveLength(1)
    expect(views[0][1]).toEqual({ feature: 'challenges' })
  })
})
