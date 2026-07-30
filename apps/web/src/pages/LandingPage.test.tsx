import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// La landing solo necesita t()/i18n.language — sin backend de i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'es' },
  }),
}))

const mockTrack = vi.fn()
vi.mock('@calistenia/core/lib/analytics', () => ({
  op: { track: (...args: unknown[]) => mockTrack(...args) },
}))

import LandingPage from './LandingPage'

// jsdom no implementa IntersectionObserver (lo usa Reveal)
class MockIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    // Revelar todo inmediatamente
    setTimeout(() => callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver), 0)
  }
  observe() {}
  disconnect() {}
  unobserve() {}
}
window.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver

function renderLanding(onGetStarted = vi.fn()) {
  render(
    <MemoryRouter>
      <LandingPage onGetStarted={onGetStarted} />
    </MemoryRouter>,
  )
  return onGetStarted
}

describe('LandingPage CTAs', () => {
  beforeEach(() => mockTrack.mockClear())

  it('todos los CTA de Android llevan a /download', () => {
    renderLanding()
    // hero + platform + final + enlace del pie
    const androidLinks = screen.getAllByRole('link', { name: /landing\.androidCta/ })
    expect(androidLinks).toHaveLength(4)
    for (const link of androidLinks) expect(link).toHaveAttribute('href', '/download')
  })

  it('el CTA Android del hero trackea location + intent android_download', () => {
    renderLanding()
    const [heroLink] = screen.getAllByRole('link', { name: /landing\.androidCta/ })
    fireEvent.click(heroLink)
    expect(mockTrack).toHaveBeenCalledWith('cta_clicked', { location: 'hero', intent: 'android_download' })
  })

  it('los CTA web llaman onGetStarted y trackean intent web_start', () => {
    const onGetStarted = renderLanding()
    const webButtons = screen.getAllByRole('button', { name: /landing\.webCta/ })
    // header + hero + platform + final
    expect(webButtons).toHaveLength(4)
    fireEvent.click(webButtons[1])
    expect(onGetStarted).toHaveBeenCalledTimes(1)
    expect(mockTrack).toHaveBeenCalledWith('cta_clicked', { location: 'hero', intent: 'web_start' })
  })

  it('cada sección enlaza a su página de función', () => {
    renderLanding()
    const hrefs = screen.getAllByRole('link', { name: /feature\.learnMore/ }).map(l => l.getAttribute('href'))
    // training + nutrition + progress + el enlace bajo el panel de "más que una rutina"
    expect(hrefs.slice(0, 3)).toEqual(['/features/training', '/features/nutrition', '/features/progress'])
    expect(hrefs).toHaveLength(4)
  })

  it('la lista "mucho más que una rutina" enlaza a las seis páginas', () => {
    renderLanding()
    const slugs = ['cardio', 'circuits', 'races', 'challenges', 'community', 'offline']
    for (const [i, slug] of slugs.entries()) {
      const link = screen.getByRole('link', { name: new RegExp(`^landing\\.beyond${i + 1}\\b`) })
      expect(link).toHaveAttribute('href', `/features/${slug}`)
    }
  })

  it('el pie lista las nueve funciones', () => {
    renderLanding()
    const footerLinks = screen.getAllByRole('link', { name: /^feature\.[a-z]+\.name$/ })
    expect(footerLinks).toHaveLength(9)
    expect(footerLinks[0]).toHaveAttribute('href', '/features/training')
  })

  it('cada superficie de conversión trackea su location', () => {
    const onGetStarted = renderLanding()
    for (const button of screen.getAllByRole('button', { name: /landing\.webCta/ })) fireEvent.click(button)
    const locations = mockTrack.mock.calls.map(([, props]) => (props as { location: string }).location)
    expect(locations).toEqual(['header', 'hero', 'platform', 'final'])
    expect(onGetStarted).toHaveBeenCalledTimes(4)
  })
})
