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

import CommunityPage from './CommunityPage'
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
    <MemoryRouter initialEntries={['/features/community']}>
      <Routes>
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/features/:slug" element={<CommunityPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('CommunityPage', () => {
  it('muestra un único h1 con el titular propio de comunidad', () => {
    renderPage()
    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('feature.community.h1')
  })

  it('publica las seis filas de «qué ven los demás» antes que ninguna otra sección', () => {
    renderPage()
    for (const n of [1, 2, 3, 4, 5, 6]) {
      expect(screen.getByText(`feature.community.see${n}What`), `see${n}What`).toBeInTheDocument()
    }
    // La primera fila lleva enlace, así que su texto va partido por `{{link}}`.
    for (const n of [2, 3, 4, 5, 6]) {
      expect(screen.getByText(`feature.community.see${n}Who`), `see${n}Who`).toBeInTheDocument()
    }
    // La tabla de privacidad va delante del feed: es la primera pregunta.
    const see = screen.getByText('feature.community.seeTitle')
    const feed = screen.getByText('feature.community.feedTitle')
    expect(see.compareDocumentPosition(feed) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('dice que las series y las marcas son legibles, y enlaza la política de privacidad', () => {
    renderPage()
    // Corrección al borrador: `sets_log` y `settings` están abiertos a cualquier
    // cuenta autenticada, así que la página no puede vender las series como privadas.
    expect(screen.getByText('feature.community.see4Who')).toBeInTheDocument()
    expect(screen.getByText('feature.community.seeLimit')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'feature.community.seeLegalLink' })).toHaveAttribute('href', '/legal')
  })

  it('describe el feed con sus tres capacidades y su límite', () => {
    renderPage()
    for (const n of [1, 2, 3]) {
      expect(screen.getByText(`feature.community.feed${n}Title`)).toBeInTheDocument()
      expect(screen.getByText(`feature.community.feed${n}Desc`)).toBeInTheDocument()
    }
    // Circuitos, retos y carreras NO salen en el feed: el límite se publica.
    expect(screen.getByRole('link', { name: 'feature.community.linkRaces' })).toHaveAttribute('href', '/features/races')
  })

  it('lista las diez categorías de la clasificación', () => {
    renderPage()
    // El mock del teléfono usa las claves del producto (`leaderboard.*`), no
    // las de la página, así que aquí no hay duplicados que esquivar.
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      expect(screen.getByText(`feature.community.lb${n}Cat`), `lb${n}Cat`).toBeInTheDocument()
      expect(screen.getByText(`feature.community.lb${n}Means`), `lb${n}Means`).toBeInTheDocument()
    }
  })

  it('detalla qué hace bloquear y qué hace denunciar', () => {
    renderPage()
    for (const n of [1, 2, 3, 4, 5]) expect(screen.getByText(`feature.community.block${n}`)).toBeInTheDocument()
    for (const n of [1, 2, 3]) expect(screen.getByText(`feature.community.report${n}`)).toBeInTheDocument()
    // Revisión a mano y sin respuesta: el límite va escrito, no escondido.
    expect(screen.getByText('feature.community.modLimit')).toBeInTheDocument()
  })

  it('enumera los cinco avisos y cómo apagarlos', () => {
    renderPage()
    for (const n of [1, 2, 3, 4, 5]) expect(screen.getByText(`feature.community.notif${n}`)).toBeInTheDocument()
    expect(screen.getByText('feature.community.notifControl')).toBeInTheDocument()
  })

  it('marca como solo-web las dos capacidades que Android no tiene', () => {
    renderPage()
    // Comparar datos con otra persona y el panel de invitados y puntos.
    for (const key of ['plat6', 'plat11']) {
      const cells = screen.getByRole('row', { name: new RegExp(`feature\\.community\\.${key}(\\s|$)`) }).querySelectorAll('td')
      expect(cells, key).toHaveLength(3)
      expect(cells[0], key).toHaveTextContent('feature.platformYes')
      expect(cells[1], key).toHaveTextContent('feature.platformNo')
    }
    // El resto de la tabla sí está en las dos plataformas.
    for (const n of [1, 2, 3, 4, 5, 7, 8, 9, 10]) {
      const cells = screen.getByRole('row', { name: new RegExp(`feature\\.community\\.plat${n}(\\s|$)`) }).querySelectorAll('td')
      expect(cells[1], `plat${n}`).toHaveTextContent('feature.platformYes')
    }
  })

  it('no marca ninguna capacidad en iOS: no hay descarga publicada', () => {
    renderPage()
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
      const cells = screen.getByRole('row', { name: new RegExp(`feature\\.community\\.plat${n}(\\s|$)`) }).querySelectorAll('td')
      expect(cells[2], `plat${n}`).toHaveTextContent('feature.platformNo')
    }
    expect(screen.getByText('feature.community.platNote')).toBeInTheDocument()
  })

  it('publica las seis preguntas frecuentes y su JSON-LD', () => {
    renderPage()
    for (const n of [1, 2, 3, 4, 5, 6]) expect(screen.getByText(`feature.community.faq${n}q`)).toBeInTheDocument()
    const script = document.querySelector('script[type="application/ld+json"]')
    expect(script).not.toBeNull()
    const data = JSON.parse(script!.innerHTML)
    expect(data['@type']).toBe('FAQPage')
    expect(data.mainEntity).toHaveLength(6)
    expect(data.mainEntity[0].name).toBe('feature.community.faq1q')
    // El marcador de enlace nunca puede llegar crudo al JSON-LD.
    for (const entry of data.mainEntity) expect(entry.acceptedAnswer.text).not.toContain('{{link}}')
  })

  it('enlaza a progreso, retos y carreras desde el cuerpo y desde el pie', () => {
    renderPage()
    for (const slug of ['progress', 'challenges', 'races']) {
      const links = screen.getAllByRole('link').filter(a => a.getAttribute('href') === `/features/${slug}`)
      expect(links.length, `enlaces a /features/${slug}`).toBeGreaterThanOrEqual(2)
    }
    expect(screen.getAllByRole('link', { name: /feature\.allFeatures/ })[0]).toHaveAttribute('href', '/features')
  })

  it('registra la vista de la página una sola vez', () => {
    track.mockClear()
    renderPage()
    const views = track.mock.calls.filter(([event]) => event === 'feature_page_viewed')
    expect(views).toHaveLength(1)
    expect(views[0][1]).toEqual({ feature: 'community' })
  })

  it('no repite las afirmaciones falsas de la plantilla', () => {
    renderPage()
    // `a1` decía que los amigos ven «récords y retos» pero no las series, cuando
    // las reglas de lectura dejan `sets_log` abierto a cualquier cuenta; `b2d`
    // prometía ver programa y fase en el feed (el feed lleva título y fecha);
    // `b3d` vendía un ranking de «sesiones, series y racha» cuando son diez
    // categorías; `a3` daba por hecho que bloquear corta la actividad en ambos
    // sentidos sin decir que es una regla de servidor. Si alguien reintroduce
    // cualquiera de esas claves, esta prueba salta.
    for (const key of ['title', 'lead', 'whatTitle', 'b1d', 'b2d', 'b3d', 'b4d', 'howNote', 's1', 'a1', 'a3']) {
      expect(screen.queryByText(`feature.community.${key}`), key).toBeNull()
    }
  })
})
