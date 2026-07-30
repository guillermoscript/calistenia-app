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

import OfflinePage from './OfflinePage'
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
    <MemoryRouter initialEntries={['/features/offline']}>
      <Routes>
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/features/:slug" element={<OfflinePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('OfflinePage', () => {
  it('muestra un único h1 con el titular propio de sin conexión', () => {
    renderPage()
    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('feature.offline.h1')
  })

  it('publica las diez filas de qué pasa sin cobertura, con sus tres columnas', () => {
    renderPage()
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      expect(screen.getByText(`feature.offline.what${n}Thing`), `what${n}Thing`).toBeInTheDocument()
      expect(screen.getByText(`feature.offline.what${n}Offline`), `what${n}Offline`).toBeInTheDocument()
      expect(screen.getByText(`feature.offline.what${n}Back`), `what${n}Back`).toBeInTheDocument()
    }
    // La tabla va delante de la sesión entre dispositivos: primero la verdad,
    // después el gancho.
    const what = screen.getByText('feature.offline.whatHeading')
    const sync = screen.getByText('feature.offline.syncTitle')
    expect(what.compareDocumentPosition(sync) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('dice que el registro de las series necesita conexión y no se reintenta', () => {
    renderPage()
    // Guardarraíl del criterio más importante de la #288: `logSet` y
    // `markWorkoutDone` se tragan el error sin pasar por la cola
    // (`useProgress.ts:336,399`) y `loadFromPB:221` sobrescribe la caché local.
    // Si alguien vuelve a redondear esto a «funciona sin internet», salta aquí.
    expect(screen.getByText('feature.offline.what7Offline')).toBeInTheDocument()
    expect(screen.getByText('feature.offline.what7Back')).toBeInTheDocument()
    expect(screen.getByText('feature.offline.whatLimit')).toBeInTheDocument()
  })

  it('explica los tres pasos de la sesión entre dispositivos, en orden', () => {
    renderPage()
    for (const n of [1, 2, 3]) {
      expect(screen.getByText(`feature.offline.sync${n}Title`)).toBeInTheDocument()
      expect(screen.getByText(`feature.offline.sync${n}Desc`)).toBeInTheDocument()
    }
    const first = screen.getByText('feature.offline.sync1Title')
    const third = screen.getByText('feature.offline.sync3Title')
    expect(first.compareDocumentPosition(third) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('ofrece las dos formas de instalarla y aclara lo del iPhone', () => {
    renderPage()
    for (const n of [1, 2]) {
      expect(screen.getByText(`feature.offline.inst${n}Title`)).toBeInTheDocument()
    }
    expect(screen.getByText('feature.offline.instLimit')).toBeInTheDocument()
  })

  it('marca como solo-Android las dos capacidades que la web no tiene', () => {
    renderPage()
    // Biblioteca completa sin conexión y recordatorios con todo cerrado: las dos
    // diferencias verificadas entre plataformas.
    for (const key of ['plat7', 'plat8']) {
      const cells = screen.getByRole('row', { name: new RegExp(`feature\\.offline\\.${key}(\\s|$)`) }).querySelectorAll('td')
      expect(cells, key).toHaveLength(3)
      expect(cells[0], key).toHaveTextContent('feature.platformNo')
      expect(cells[1], key).toHaveTextContent('feature.platformYes')
    }
    // El resto funciona igual en las dos.
    for (const n of [1, 2, 3, 4, 5, 6, 9]) {
      const cells = screen.getByRole('row', { name: new RegExp(`feature\\.offline\\.plat${n}(\\s|$)`) }).querySelectorAll('td')
      expect(cells[0], `plat${n}`).toHaveTextContent('feature.platformYes')
      expect(cells[1], `plat${n}`).toHaveTextContent('feature.platformYes')
    }
  })

  it('no marca ninguna capacidad en iOS: no hay descarga publicada', () => {
    renderPage()
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      const cells = screen.getByRole('row', { name: new RegExp(`feature\\.offline\\.plat${n}(\\s|$)`) }).querySelectorAll('td')
      expect(cells[2], `plat${n}`).toHaveTextContent('feature.platformNo')
    }
    // Esta página es la declaración de referencia sobre iOS de toda la épica:
    // la nota explica la columna vacía en vez de dejarla insinuando.
    expect(screen.getByText('feature.offline.platNote')).toBeInTheDocument()
  })

  it('publica las seis preguntas frecuentes y su JSON-LD', () => {
    renderPage()
    for (const n of [1, 2, 3, 4, 5, 6]) expect(screen.getByText(`feature.offline.faq${n}q`)).toBeInTheDocument()
    const script = document.querySelector('script[type="application/ld+json"]')
    expect(script).not.toBeNull()
    const data = JSON.parse(script!.innerHTML)
    expect(data['@type']).toBe('FAQPage')
    expect(data.mainEntity).toHaveLength(6)
    expect(data.mainEntity[0].name).toBe('feature.offline.faq1q')
    for (const entry of data.mainEntity) expect(entry.acceptedAnswer.text).not.toContain('{{link}}')
  })

  it('ofrece volver al índice y descargar la app', () => {
    renderPage()
    expect(screen.getAllByRole('link', { name: /feature\.allFeatures/ })[0]).toHaveAttribute('href', '/features')
    for (const link of screen.getAllByRole('link', { name: /landing\.androidCta/ })) {
      expect(link).toHaveAttribute('href', '/download')
    }
  })

  it('enlaza a entrenamiento, cardio y progreso desde el cuerpo y desde el pie', () => {
    renderPage()
    for (const slug of ['training', 'cardio', 'progress']) {
      const links = screen.getAllByRole('link').filter(a => a.getAttribute('href') === `/features/${slug}`)
      expect(links.length, `enlaces a /features/${slug}`).toBeGreaterThanOrEqual(2)
    }
    // Los circuitos entran por la fila 5 de la tabla.
    expect(screen.getAllByRole('link', { name: 'feature.offline.linkCircuits' })[0]).toHaveAttribute('href', '/features/circuits')
  })

  it('registra la vista de la página una sola vez', () => {
    track.mockClear()
    renderPage()
    const views = track.mock.calls.filter(([event]) => event === 'feature_page_viewed')
    expect(views).toHaveLength(1)
    expect(views[0][1]).toEqual({ feature: 'offline' })
  })

  it('no repite las afirmaciones falsas de la plantilla', () => {
    renderPage()
    // `b1d` decía que «tus sesiones, series y registros se guardan en el
    // teléfono aunque estés sin señal» y `b2d` que al volver «todo lo que
    // hiciste sube sin que tengas que apretar nada»: las dos son falsas para
    // las series y el entreno completado. `s2`/`s3` generalizaban lo mismo.
    // Si alguien reintroduce cualquiera de esas claves, esta prueba salta.
    for (const key of ['title', 'lead', 'whatTitle', 'b1d', 'b2d', 'b3d', 'b4d', 'howNote', 's1', 's2', 's3', 'a1', 'a2', 'a3']) {
      expect(screen.queryByText(`feature.offline.${key}`), key).toBeNull()
    }
  })
})
