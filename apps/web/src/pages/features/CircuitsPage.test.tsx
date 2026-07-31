import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
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

import CircuitsPage from './CircuitsPage'
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
  return render(
    <MemoryRouter initialEntries={['/features/circuits']}>
      <Routes>
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/features/:slug" element={<CircuitsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.useRealTimers()
})

describe('CircuitsPage', () => {
  it('muestra un único h1 con el titular propio de circuitos', () => {
    renderPage()
    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('feature.circuits.h1')
  })

  it('compara los dos modos en cinco filas', () => {
    renderPage()
    for (const n of [1, 2, 3, 4, 5]) {
      expect(screen.getByText(`feature.circuits.mode${n}Aspect`)).toBeInTheDocument()
      expect(screen.getByText(`feature.circuits.mode${n}Circuit`)).toBeInTheDocument()
      expect(screen.getByText(`feature.circuits.mode${n}Timed`)).toBeInTheDocument()
    }
  })

  it('la demo del cronómetro arranca parada', () => {
    renderPage()
    // Criterio de aceptación de #284: nada de reproducción automática.
    expect(screen.getByRole('button', { name: /feature\.circuits\.demoPlay/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /feature\.circuits\.demoPause/ })).toBeNull()
  })

  it('la demo no deja timers colgando al desmontar', async () => {
    vi.useFakeTimers()
    const { unmount } = renderPage()
    // Primero se vacía lo que encola el mock de IntersectionObserver: hasta que
    // no llega el callback, la demo se considera fuera de pantalla y no cuenta.
    await act(async () => { vi.runOnlyPendingTimers() })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /feature\.circuits\.demoPlay/ })) })
    await act(async () => { vi.advanceTimersByTime(3000) })
    expect(vi.getTimerCount(), 'la demo debería tener su intervalo corriendo').toBeGreaterThan(0)
    unmount()
    expect(vi.getTimerCount(), 'el intervalo sobrevivió al desmontaje').toBe(0)
  })

  it('con movimiento reducido la demo no se anima y describe la secuencia', () => {
    // `src/test/setup.ts` stubbea matchMedia a `matches: false`; aquí se
    // sobrescribe para probar la otra rama.
    const original = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
    try {
      renderPage()
      expect(screen.getByText('feature.circuits.demoStatic')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /feature\.circuits\.demoPlay/ })).toBeNull()
    } finally {
      window.matchMedia = original
    }
  })

  it('publica los seis ajustes con su rango y su valor por defecto', () => {
    renderPage()
    for (const n of [1, 2, 3, 4, 5, 6]) {
      expect(screen.getByText(`feature.circuits.cfg${n}Setting`)).toBeInTheDocument()
      expect(screen.getByText(`feature.circuits.cfg${n}Range`)).toBeInTheDocument()
      expect(screen.getByText(`feature.circuits.cfg${n}Default`)).toBeInTheDocument()
    }
  })

  it('dice que la configuración no se guarda entre visitas', () => {
    renderPage()
    expect(screen.getByText('feature.circuits.cfgLimit')).toBeInTheDocument()
  })

  it('declara que el cronómetro necesita la app delante y enlaza al cardio', () => {
    renderPage()
    // El texto va partido por el enlace, así que se busca por el trozo inicial.
    expect(screen.getByText(/feature\.circuits\.demoLimit/)).toBeInTheDocument()
    const cardioLinks = screen.getAllByRole('link').filter(a => a.getAttribute('href') === '/features/cardio')
    expect(cardioLinks.length).toBeGreaterThanOrEqual(2)
  })

  it('marca las capacidades que solo están en una plataforma', () => {
    renderPage()
    // Plantillas y detalle del circuito terminado: solo web.
    for (const key of ['plat5', 'plat6']) {
      const cells = screen.getByRole('row', { name: new RegExp(`feature\\.circuits\\.${key}`) }).querySelectorAll('td')
      expect(cells[0], key).toHaveTextContent('feature.platformYes')
      expect(cells[1], key).toHaveTextContent('feature.platformNo')
    }
    // Catálogo sin conexión y pulso del reloj: solo Android.
    for (const key of ['plat7', 'plat8']) {
      const cells = screen.getByRole('row', { name: new RegExp(`feature\\.circuits\\.${key}`) }).querySelectorAll('td')
      expect(cells[0], key).toHaveTextContent('feature.platformNo')
      expect(cells[1], key).toHaveTextContent('feature.platformYes')
    }
    // Ninguna capacidad marcada en iOS: no hay descarga publicada.
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const cells = screen.getByRole('row', { name: new RegExp(`feature\\.circuits\\.plat${n}(\\s|$)`) }).querySelectorAll('td')
      expect(cells[2], `plat${n}`).toHaveTextContent('feature.platformNo')
    }
  })

  it('publica las seis preguntas frecuentes y su JSON-LD', () => {
    renderPage()
    for (const n of [1, 2, 3, 4, 5, 6]) expect(screen.getByText(`feature.circuits.faq${n}q`)).toBeInTheDocument()
    const script = document.querySelector('script[type="application/ld+json"]')
    expect(script).not.toBeNull()
    const data = JSON.parse(script!.innerHTML)
    expect(data['@type']).toBe('FAQPage')
    expect(data.mainEntity).toHaveLength(6)
    expect(data.mainEntity[0].name).toBe('feature.circuits.faq1q')
    // El marcador de enlace nunca puede llegar crudo al JSON-LD.
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
    for (const slug of ['training', 'cardio', 'progress']) {
      const links = screen.getAllByRole('link').filter(a => a.getAttribute('href') === `/features/${slug}`)
      expect(links.length, `enlaces a /features/${slug}`).toBeGreaterThanOrEqual(2)
    }
  })

  it('registra la vista de la página una sola vez', () => {
    track.mockClear()
    renderPage()
    const views = track.mock.calls.filter(([event]) => event === 'feature_page_viewed')
    expect(views).toHaveLength(1)
    expect(views[0][1]).toEqual({ feature: 'circuits' })
  })

  it('no repite las afirmaciones falsas de la plantilla', () => {
    renderPage()
    // `b3d` decía que la configuración se guarda para repetirla, `b2d` vendía
    // las plantillas y el «catálogo completo», `howNote` prometía el detalle
    // como el de una sesión de programa y `a3` metía los circuitos en tu
    // actividad y tu racha. Si alguien las reintroduce, esto salta.
    for (const key of ['b2d', 'b3d', 'howNote', 'a2', 'a3', 'title', 'lead', 'whatTitle', 's1', 's2', 's3']) {
      expect(screen.queryByText(`feature.circuits.${key}`), key).toBeNull()
    }
  })
})
