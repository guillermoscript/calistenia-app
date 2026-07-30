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

import NutritionPage from './NutritionPage'
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
    <MemoryRouter initialEntries={['/features/nutrition']}>
      <Routes>
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/features/:slug" element={<NutritionPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('NutritionPage', () => {
  it('muestra un único h1 con el titular propio de nutrición', () => {
    renderPage()
    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('feature.nutrition.h1')
  })

  it('recorre los cinco pasos del circuito en orden', () => {
    renderPage()
    const titles = [1, 2, 3, 4, 5].map(n => screen.getByText(`feature.nutrition.loop${n}Title`))
    expect(titles).toHaveLength(5)
    // El orden en el DOM importa: el circuito solo se entiende leído seguido.
    for (let i = 1; i < titles.length; i++) {
      expect(titles[i - 1].compareDocumentPosition(titles[i])).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    }
    // Y la vuelta del 05 al 01, que es lo que lo convierte en ciclo.
    expect(screen.getByText('feature.nutrition.loopBack')).toBeInTheDocument()
  })

  it('marca los dos caminos de registro que solo están en web', () => {
    renderPage()
    for (const n of [1, 2, 3, 4, 5, 6]) {
      expect(screen.getByText(`feature.nutrition.way${n}Way`)).toBeInTheDocument()
    }
    // 3 = buscar el alimento, 4 = código de barras. Ninguno existe en Android.
    expect(screen.getByText('feature.nutrition.way3Where')).toBeInTheDocument()
    expect(screen.getByText('feature.nutrition.way4Where')).toBeInTheDocument()
    // Y la tabla de paridad lo repite en sus dos filas.
    for (const key of ['plat7', 'plat8']) {
      const row = screen.getByRole('row', { name: new RegExp(`feature\\.nutrition\\.${key}`) })
      const cells = row.querySelectorAll('td')
      expect(cells[0]).toHaveTextContent('feature.platformYes')
      expect(cells[1]).toHaveTextContent('feature.platformNo')
      expect(cells[2]).toHaveTextContent('feature.platformNo')
    }
  })

  it('declara el límite del análisis y el aviso de que no es consejo médico', () => {
    renderPage()
    expect(screen.getByText('feature.nutrition.aiLimit')).toBeInTheDocument()
    // El aviso vive en el cuerpo (S4/S5), no solo escondido en el FAQ.
    expect(screen.getByText('feature.nutrition.aiScore')).toBeInTheDocument()
  })

  it('publica la tabla de objetivos con sus cuatro filas', () => {
    renderPage()
    for (const n of [1, 2, 3, 4]) {
      expect(screen.getByText(`feature.nutrition.goal${n}Goal`)).toBeInTheDocument()
      expect(screen.getByText(`feature.nutrition.goal${n}Effect`)).toBeInTheDocument()
    }
  })

  it('dice que los precios salen de las compras del usuario', () => {
    renderPage()
    expect(screen.getByText('feature.nutrition.money1Title')).toBeInTheDocument()
    expect(screen.getByText('feature.nutrition.moneyLimit')).toBeInTheDocument()
  })

  it('publica las seis preguntas frecuentes y su JSON-LD', () => {
    renderPage()
    for (const n of [1, 2, 3, 4, 5, 6]) {
      expect(screen.getByText(`feature.nutrition.faq${n}q`)).toBeInTheDocument()
    }
    const script = document.querySelector('script[type="application/ld+json"]')
    expect(script).not.toBeNull()
    const data = JSON.parse(script!.innerHTML)
    expect(data['@type']).toBe('FAQPage')
    expect(data.mainEntity).toHaveLength(6)
    expect(data.mainEntity[0].name).toBe('feature.nutrition.faq1q')
    expect(data.mainEntity[0].acceptedAnswer.text).toBe('feature.nutrition.faq1a')
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
    for (const slug of ['progress', 'training', 'community']) {
      const links = screen.getAllByRole('link').filter(a => a.getAttribute('href') === `/features/${slug}`)
      expect(links.length, `enlaces a /features/${slug}`).toBeGreaterThanOrEqual(2)
    }
  })

  it('registra la vista de la página una sola vez', () => {
    track.mockClear()
    renderPage()
    const views = track.mock.calls.filter(([event]) => event === 'feature_page_viewed')
    expect(views).toHaveLength(1)
    expect(views[0][1]).toEqual({ feature: 'nutrition' })
  })

  it('no repite las tres frases falsas de la plantilla', () => {
    renderPage()
    // `b2d`/`howNote` decían que las metas se ajustan a la fase de entrenamiento
    // (la fase solo dispara un banner) y `b1d`/`s1` vendían el código de barras
    // sin decir que es solo web. Si alguien las reintroduce, esto lo caza.
    for (const key of ['b1d', 'b2d', 'howNote', 's1', 'lead']) {
      expect(screen.queryByText(`feature.nutrition.${key}`)).toBeNull()
    }
  })
})
