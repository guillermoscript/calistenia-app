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

import CardioPage from './CardioPage'
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
    <MemoryRouter initialEntries={['/features/cardio']}>
      <Routes>
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/features/:slug" element={<CardioPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('CardioPage', () => {
  it('renderiza un único h1 con el titular propio de cardio', () => {
    renderPage()
    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('feature.cardio.h1')
  })

  it('lista las ocho métricas con su fuente en la tabla de datos', () => {
    renderPage()
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
      // `getAllByText`: el nombre de una métrica puede repetirse en un mock
      // (los parciales también se rotulan en el resumen del paso 4).
      expect(screen.getAllByText(`feature.cardio.m${n}Name`).length).toBeGreaterThan(0)
      expect(screen.getByText(`feature.cardio.m${n}Source`)).toBeInTheDocument()
    }
  })

  it('recorre los cuatro estados de una sesión, incluida la pantalla de bloqueo', () => {
    renderPage()
    const labels = [1, 2, 3, 4].map(n => screen.getByText(new RegExp(`feature\\.cardio\\.run${n}Label`)))
    expect(labels).toHaveLength(4)
    for (const n of [1, 2, 3, 4]) {
      expect(screen.getByText(`feature.cardio.run${n}Title`)).toBeInTheDocument()
    }
    // El paso 3 es el de la notificación con la app cerrada.
    expect(screen.getByText('feature.cardio.run3Desc')).toBeInTheDocument()
  })

  it('marca en la tabla de plataformas que el segundo plano es solo de Android', () => {
    renderPage()
    const row = screen.getByRole('row', { name: /feature\.cardio\.p2/ })
    const cells = row.querySelectorAll('td')
    expect(cells).toHaveLength(3)
    // web · android · iOS → solo Android disponible
    expect(cells[0]).toHaveTextContent('feature.platformNo')
    expect(cells[1]).toHaveTextContent('feature.platformYes')
    expect(cells[2]).toHaveTextContent('feature.platformNo')
  })

  it('declara los límites honestos: sin iOS, sin autopausa, sin Strava', () => {
    renderPage()
    for (const n of [1, 2, 3, 4, 5, 6, 7]) {
      expect(screen.getByText(`feature.cardio.limit${n}`)).toBeInTheDocument()
    }
  })

  it('enlaza a carreras, progreso y offline desde el cuerpo y desde las relacionadas', () => {
    renderPage()
    for (const [slug, hrefCount] of [['races', 2], ['progress', 2], ['offline', 2]] as const) {
      const links = screen.getAllByRole('link').filter(a => a.getAttribute('href') === `/features/${slug}`)
      expect(links.length, `enlaces a /features/${slug}`).toBeGreaterThanOrEqual(hrefCount)
    }
  })

  it('ofrece volver al índice y todos los enlaces de Android apuntan a /download', () => {
    renderPage()
    expect(screen.getAllByRole('link', { name: /feature\.allFeatures/ })[0]).toHaveAttribute('href', '/features')
    const androidLinks = screen.getAllByRole('link', { name: /landing\.androidCta/ })
    expect(androidLinks.length).toBeGreaterThan(0)
    for (const link of androidLinks) expect(link).toHaveAttribute('href', '/download')
  })

  it('emite feature_page_viewed una sola vez con feature: cardio', () => {
    track.mockClear()
    renderPage()
    const views = track.mock.calls.filter(([event]) => event === 'feature_page_viewed')
    expect(views).toHaveLength(1)
    expect(views[0][1]).toEqual({ feature: 'cardio' })
  })

  it('inyecta un JSON-LD de FAQPage con las cinco preguntas', () => {
    renderPage()
    const script = document.querySelector('script[type="application/ld+json"]')
    expect(script).not.toBeNull()
    const data = JSON.parse(script!.innerHTML)
    expect(data['@type']).toBe('FAQPage')
    expect(data.mainEntity).toHaveLength(5)
    expect(data.mainEntity[0].name).toBe('feature.cardio.fq1')
    expect(data.mainEntity[0].acceptedAnswer.text).toBe('feature.cardio.fa1')
  })

  it('no repite el bulo de que las carreras usan el mismo motor de GPS', () => {
    renderPage()
    // Las claves de la plantilla ya no existen para cardio: si alguien las
    // reintroduce, este assert lo caza antes que la revisión.
    expect(screen.queryByText('feature.cardio.a3')).toBeNull()
    expect(screen.queryByText('feature.cardio.b2d')).toBeNull()
  })
})
