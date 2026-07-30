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

import RacesPage from './RacesPage'
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
    <MemoryRouter initialEntries={['/features/races']}>
      <Routes>
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/features/:slug" element={<RacesPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RacesPage', () => {
  it('muestra un único h1 con el titular propio de carreras', () => {
    renderPage()
    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('feature.races.h1')
  })

  it('recorre los cuatro estados de una carrera en orden', () => {
    renderPage()
    const badges = [1, 2, 3, 4].map(n => screen.getByText(`feature.races.life${n}Badge`))
    // El orden en el DOM importa: la sección cuenta una máquina de estados.
    for (let i = 1; i < badges.length; i++) {
      expect(badges[i - 1].compareDocumentPosition(badges[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    for (const n of [1, 2, 3, 4]) {
      expect(screen.getByText(`feature.races.life${n}Title`)).toBeInTheDocument()
      expect(screen.getByText(`feature.races.life${n}Actions`)).toBeInTheDocument()
    }
    // El quinto estado (`cancelled`) no es un paso: va como límite al pie.
    expect(screen.getByText('feature.races.lifeNote')).toBeInTheDocument()
  })

  it('explica las cinco columnas de la tabla en vivo', () => {
    renderPage()
    for (const n of [1, 2, 3, 4, 5]) {
      // `getAllByText`: las cabeceras se repiten en el mock del leaderboard.
      expect(screen.getAllByText(`feature.races.board${n}Name`).length).toBeGreaterThan(0)
      expect(screen.getByText(`feature.races.board${n}Desc`)).toBeInTheDocument()
    }
  })

  it('publica la regla del ganador para cada tipo de carrera', () => {
    renderPage()
    // Es el dato que la plantilla contradecía: en modo distancia gana el
    // primero en llegar, no quien más distancia lleve.
    for (const n of [1, 2, 3]) {
      expect(screen.getByText(`feature.races.rank${n}Mode`)).toBeInTheDocument()
      expect(screen.getByText(`feature.races.rank${n}Rule`)).toBeInTheDocument()
    }
  })

  it('compara carrera y reto en las cinco dimensiones', () => {
    renderPage()
    for (const n of [1, 2, 3, 4, 5]) {
      expect(screen.getByText(`feature.races.vs${n}Aspect`)).toBeInTheDocument()
      expect(screen.getByText(`feature.races.vs${n}Race`)).toBeInTheDocument()
      expect(screen.getByText(`feature.races.vs${n}Challenge`)).toBeInTheDocument()
    }
  })

  it('marca las capacidades que solo están en una plataforma', () => {
    renderPage()
    // Ruta dibujada, QR, aviso de puesto y tarjeta/GPX: solo web.
    for (const key of ['plat5', 'plat6', 'plat7', 'plat9']) {
      const cells = screen.getByRole('row', { name: new RegExp(`feature\\.races\\.${key}`) }).querySelectorAll('td')
      expect(cells, key).toHaveLength(3)
      expect(cells[0], key).toHaveTextContent('feature.platformYes')
      expect(cells[1], key).toHaveTextContent('feature.platformNo')
      expect(cells[2], key).toHaveTextContent('feature.platformNo')
    }
    // La vibración por kilómetro solo existe en el móvil.
    const kmHaptic = screen.getByRole('row', { name: /feature\.races\.plat8/ }).querySelectorAll('td')
    expect(kmHaptic[0]).toHaveTextContent('feature.platformNo')
    expect(kmHaptic[1]).toHaveTextContent('feature.platformYes')
    expect(kmHaptic[2]).toHaveTextContent('feature.platformNo')
  })

  it('no marca ninguna capacidad en iOS: no hay descarga publicada', () => {
    renderPage()
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const cells = screen.getByRole('row', { name: new RegExp(`feature\\.races\\.plat${n}(\\s|$)`) }).querySelectorAll('td')
      expect(cells[2], `plat${n}`).toHaveTextContent('feature.platformNo')
    }
    expect(screen.getByText('feature.races.platNote')).toBeInTheDocument()
  })

  it('publica las seis preguntas frecuentes y su JSON-LD', () => {
    renderPage()
    for (const n of [1, 2, 3, 4, 5, 6]) expect(screen.getByText(`feature.races.faq${n}q`)).toBeInTheDocument()
    const script = document.querySelector('script[type="application/ld+json"]')
    expect(script).not.toBeNull()
    const data = JSON.parse(script!.innerHTML)
    expect(data['@type']).toBe('FAQPage')
    expect(data.mainEntity).toHaveLength(6)
    expect(data.mainEntity[0].name).toBe('feature.races.faq1q')
    // El marcador de enlace nunca puede llegar crudo al JSON-LD.
    for (const entry of data.mainEntity) expect(entry.acceptedAnswer.text).not.toContain('{{link}}')
  })

  it('ofrece volver al índice y todos los enlaces de Android apuntan a /download', () => {
    renderPage()
    expect(screen.getAllByRole('link', { name: /feature\.allFeatures/ })[0]).toHaveAttribute('href', '/features')
    const androidLinks = screen.getAllByRole('link', { name: /landing\.androidCta/ })
    expect(androidLinks.length).toBeGreaterThan(0)
    for (const link of androidLinks) expect(link).toHaveAttribute('href', '/download')
  })

  it('enlaza a cardio, retos y progreso desde el cuerpo y desde el pie', () => {
    renderPage()
    for (const slug of ['cardio', 'challenges', 'progress']) {
      const links = screen.getAllByRole('link').filter(a => a.getAttribute('href') === `/features/${slug}`)
      expect(links.length, `enlaces a /features/${slug}`).toBeGreaterThanOrEqual(2)
    }
  })

  it('registra la vista de la página una sola vez', () => {
    track.mockClear()
    renderPage()
    const views = track.mock.calls.filter(([event]) => event === 'feature_page_viewed')
    expect(views).toHaveLength(1)
    expect(views[0][1]).toEqual({ feature: 'races' })
  })

  it('no repite las afirmaciones falsas de la plantilla', () => {
    renderPage()
    // `b1d` prometía distancia objetivo Y duración (los modos son excluyentes),
    // `b2d`/`s2` decían que cada quien inicia su propio recorrido (la salida es
    // común), `b4d` daba por hecho un cierre automático al vencer la ventana
    // (lo dispara un cliente) y `a2` dejaba mirar la carrera sin cuenta (en web
    // solo se ve la pantalla de acceso). Si alguien las reintroduce, esto salta.
    for (const key of ['b1d', 'b2d', 'b4d', 's2', 'a2', 'title', 'lead', 'whatTitle', 'howNote']) {
      expect(screen.queryByText(`feature.races.${key}`), key).toBeNull()
    }
  })
})
