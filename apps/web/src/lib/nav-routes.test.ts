import { describe, expect, it } from 'vitest'

import { MOBILE_TABS, NAV_ITEMS, NAV_SECTIONS, isNavItemActive } from './nav-routes'

/**
 * Estas tres listas se mantenían a mano y habían divergido (issue #488).
 * Ahora se derivan de un registro único, y este test fija el resultado: si
 * alguien añade una ruta al registro y se le olvida decir dónde sale, o la
 * mete en el sitio equivocado, salta aquí en vez de en producción.
 */
describe('nav-routes', () => {
  const FIVE = [
    ['/', 'nav.today'],
    ['/workout', 'nav.workout'],
    ['/nutrition', 'nav.nutrition'],
    ['/progress', 'nav.progress'],
    ['/community', 'nav.community'],
  ]

  it('la barra inferior son exactamente los 5 destinos (#856)', () => {
    expect(MOBILE_TABS.map(t => [t.path, t.labelKey])).toEqual(FIVE)
  })

  it('el sidebar son los mismos 5 más los atajos', () => {
    expect(NAV_SECTIONS.map(s => [s.key, s.labelKey])).toEqual([
      ['main', null],
      ['shortcuts', 'nav.sectionShortcuts'],
    ])
    expect(NAV_SECTIONS[0].items.map(i => [i.path, i.labelKey])).toEqual(FIVE)
    expect(NAV_SECTIONS[1].items.map(i => [i.path, i.labelKey])).toEqual([
      ['/free-session', 'nav.freeSession'],
      ['/cardio', 'nav.cardioGps'],
      ['/log-workout', 'nav.logOutsideWorkout'],
    ])
  })

  it('las rutas que salen de la navegación siguen teniendo nombre en el breadcrumb', () => {
    const breadcrumb = NAV_ITEMS.map(i => i.path)
    for (const path of ['/calendar', '/reminders', '/programs', '/exercises', '/friends', '/leaderboard', '/referrals', '/lumbar', '/circuit', '/sleep', '/feed', '/cardio', '/profile', '/notifications']) {
      expect(breadcrumb, path).toContain(path)
    }
    const inSidebar = NAV_SECTIONS.flatMap(s => s.items.map(i => i.path))
    for (const path of ['/calendar', '/reminders', '/programs', '/exercises', '/friends', '/leaderboard', '/referrals', '/lumbar', '/circuit', '/sleep', '/feed']) {
      expect(inSidebar, path).not.toContain(path)
    }
    // `getBreadcrumbKey` lo nombra `breadcrumb.logWorkout`.
    expect(breadcrumb).not.toContain('/log-workout')
  })

  it('no repite rutas ni deja ninguna sin icono', () => {
    const all = [...NAV_ITEMS, ...NAV_SECTIONS.flatMap(s => s.items)]
    for (const item of all) {
      expect(item.icon, `${item.path} sin icono`).toBeTypeOf('function')
      expect(item.labelKey, `${item.path} sin labelKey`).toMatch(/^nav\./)
    }
    const sidebarPaths = NAV_SECTIONS.flatMap(s => s.items.map(i => i.path))
    expect(new Set(sidebarPaths).size).toBe(sidebarPaths.length)
    const breadcrumbPaths = NAV_ITEMS.map(i => i.path)
    expect(new Set(breadcrumbPaths).size).toBe(breadcrumbPaths.length)
  })
})

describe('isNavItemActive', () => {
  const tab = (path: string) => MOBILE_TABS.find(t => t.path === path)!
  const activeTab = (pathname: string) => MOBILE_TABS.filter(t => isNavItemActive(t, pathname)).map(t => t.path)

  it('Hoy solo en `/` exacto', () => {
    expect(isNavItemActive(tab('/'), '/')).toBe(true)
    expect(isNavItemActive(tab('/'), '/workout')).toBe(false)
  })

  it('las rutas que salieron de la navegación marcan su pestaña destino', () => {
    expect(activeTab('/workout')).toEqual(['/workout'])
    expect(activeTab('/programs/abc')).toEqual(['/workout'])
    expect(activeTab('/lumbar')).toEqual(['/workout'])
    expect(activeTab('/calendar')).toEqual(['/progress'])
    expect(activeTab('/session/2026-09-29/p1_lun')).toEqual(['/progress'])
    expect(activeTab('/challenges/xyz')).toEqual(['/community'])
    expect(activeTab('/feed')).toEqual(['/community'])
    expect(activeTab('/u/abc')).toEqual(['/community'])
    expect(activeTab('/pantry/recipes')).toEqual(['/nutrition'])
  })

  it('un prefijo no casa con otra ruta que empiece igual', () => {
    expect(activeTab('/programsx')).toEqual([])
    expect(activeTab('/profile')).toEqual([])
  })
})
