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

import ProgressPage from './ProgressPage'
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
    <MemoryRouter initialEntries={['/features/progress']}>
      <Routes>
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/features/:slug" element={<ProgressPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProgressPage', () => {
  it('muestra un único h1 con el titular propio de progreso', () => {
    renderPage()
    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('feature.progress.h1')
  })

  it('publica las once señales del calendario, no seis métricas', () => {
    renderPage()
    for (let n = 1; n <= 11; n++) {
      // Cada señal sale dos veces: en la leyenda del mock y en la tabla.
      expect(screen.getAllByText(`feature.progress.cal${n}Signal`).length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText(`feature.progress.cal${n}Source`)).toBeInTheDocument()
    }
    // La duodécima no existe: si alguien amplía la lista sin tocar el calendario real, esto lo caza.
    expect(screen.queryByText('feature.progress.cal12Signal')).toBeNull()
  })

  it('cuenta qué pasa al tocar un día y qué pasa si una fuente falla', () => {
    renderPage()
    expect(screen.getByText('feature.progress.calDay')).toBeInTheDocument()
    expect(screen.getByText('feature.progress.calResilience')).toBeInTheDocument()
  })

  it('marca las cinco gráficas de fuerza como solo web', () => {
    renderPage()
    for (let n = 1; n <= 5; n++) {
      expect(screen.getByText(`feature.progress.str${n}What`)).toBeInTheDocument()
      expect(screen.getByText(`feature.progress.str${n}Where`)).toBeInTheDocument()
    }
    // Y la tabla de paridad lo repite en sus cuatro filas de web.
    for (const key of ['plat6', 'plat7', 'plat8', 'plat9']) {
      const row = screen.getByRole('row', { name: new RegExp(`feature\\.progress\\.${key}`) })
      const cells = row.querySelectorAll('td')
      expect(cells[0]).toHaveTextContent('feature.platformYes')
      expect(cells[1]).toHaveTextContent('feature.platformNo')
      expect(cells[2]).toHaveTextContent('feature.platformNo')
    }
  })

  it('explica que los récords se calculan solos y su límite', () => {
    renderPage()
    expect(screen.getByText('feature.progress.prTitle')).toBeInTheDocument()
    expect(screen.getByText('feature.progress.prDesc')).toBeInTheDocument()
    expect(screen.getByText('feature.progress.prCelebrate')).toBeInTheDocument()
    expect(screen.getByText('feature.progress.strLimit')).toBeInTheDocument()
  })

  it('publica las cuatro fichas de cuerpo con su margen de error', () => {
    renderPage()
    for (let n = 1; n <= 4; n++) {
      expect(screen.getByText(`feature.progress.body${n}Title`)).toBeInTheDocument()
      expect(screen.getByText(`feature.progress.body${n}Desc`)).toBeInTheDocument()
    }
    expect(screen.getByText('feature.progress.bodyLimit')).toBeInTheDocument()
  })

  it('dice en el cuerpo que el resumen semanal no es consejo médico', () => {
    renderPage()
    for (let n = 1; n <= 3; n++) {
      expect(screen.getByText(`feature.progress.week${n}Title`)).toBeInTheDocument()
    }
    // El aviso vive en la sección, no escondido en el FAQ.
    expect(screen.getByText('feature.progress.weekLimit')).toBeInTheDocument()
  })

  it('publica la tabla de privacidad completa y enlaza a la política', () => {
    renderPage()
    for (let n = 1; n <= 6; n++) {
      expect(screen.getByText(`feature.progress.priv${n}What`)).toBeInTheDocument()
    }
    // La fila 5 es la única que otras cuentas pueden leer: enlaza a comunidad.
    const community = screen.getAllByRole('link').filter(a => a.getAttribute('href') === '/features/community')
    expect(community.length).toBeGreaterThanOrEqual(1)
    // Y el apunte sobre la dirección de las fotos no se calla.
    expect(screen.getByText('feature.progress.privLimit')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'feature.progress.privLegalLink' })).toHaveAttribute('href', '/legal')
  })

  it('publica las seis preguntas frecuentes y su JSON-LD', () => {
    renderPage()
    for (const n of [1, 2, 3, 4, 5, 6]) {
      expect(screen.getByText(`feature.progress.faq${n}q`)).toBeInTheDocument()
    }
    const script = document.querySelector('script[type="application/ld+json"]')
    expect(script).not.toBeNull()
    const data = JSON.parse(script!.innerHTML)
    expect(data['@type']).toBe('FAQPage')
    expect(data.mainEntity).toHaveLength(6)
    expect(data.mainEntity[0].name).toBe('feature.progress.faq1q')
    expect(data.mainEntity[0].acceptedAnswer.text).toBe('feature.progress.faq1a')
  })

  it('ofrece volver al índice, descargar la app y ver las funciones relacionadas', () => {
    renderPage()
    expect(screen.getAllByRole('link', { name: /feature\.allFeatures/ })[0]).toHaveAttribute('href', '/features')
    const androidLinks = screen.getAllByRole('link', { name: /landing\.androidCta/ })
    expect(androidLinks.length).toBeGreaterThan(0)
    for (const link of androidLinks) expect(link).toHaveAttribute('href', '/download')
    for (const slug of ['training', 'nutrition', 'community']) {
      const links = screen.getAllByRole('link').filter(a => a.getAttribute('href') === `/features/${slug}`)
      expect(links.length, `enlaces a /features/${slug}`).toBeGreaterThanOrEqual(2)
    }
  })

  it('registra la vista de la página una sola vez', () => {
    track.mockClear()
    renderPage()
    const views = track.mock.calls.filter(([event]) => event === 'feature_page_viewed')
    expect(views).toHaveLength(1)
    expect(views[0][1]).toEqual({ feature: 'progress' })
  })

  it('no repite las frases falsas de la plantilla', () => {
    renderPage()
    // `b1d` vendía «seis métricas» juntas cuando son once señales, `a2` decía
    // que las fotos y las medidas las ve «solo tú» sin matizar la dirección del
    // archivo, y `b2d` daba las gráficas por disponibles en todas partes.
    for (const key of ['b1d', 'b2d', 'b3d', 'b4d', 'howNote', 's1', 'a2', 'lead', 'title']) {
      expect(screen.queryByText(`feature.progress.${key}`)).toBeNull()
    }
  })
})
