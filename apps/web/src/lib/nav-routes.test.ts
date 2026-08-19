import { describe, expect, it } from 'vitest'

import { MOBILE_TABS, NAV_ITEMS, NAV_SECTIONS } from './nav-routes'

/**
 * Estas tres listas se mantenían a mano y habían divergido (issue #488).
 * Ahora se derivan de un registro único, y este test fija el resultado: si
 * alguien añade una ruta al registro y se le olvida decir dónde sale, o la
 * mete en el sitio equivocado, salta aquí en vez de en producción.
 */
describe('nav-routes', () => {
  it('deriva el breadcrumb sin las rutas que tienen clave propia', () => {
    expect(NAV_ITEMS.map(i => i.path)).toEqual([
      '/', '/workout', '/free-session', '/cardio', '/circuit', '/lumbar',
      '/progress', '/nutrition', '/sleep', '/calendar', '/reminders',
      '/programs', '/exercises',
      '/friends', '/challenges', '/community-programs', '/leaderboard', '/referrals',
      '/feed', '/notifications', '/profile',
    ])
    // `/log-workout` se queda fuera: `getBreadcrumbKey` lo nombra
    // `breadcrumb.logWorkout`, no `nav.logWorkout`.
    expect(NAV_ITEMS.map(i => i.path)).not.toContain('/log-workout')
  })

  it('deriva la barra inferior en su orden, con sus etiquetas propias', () => {
    expect(MOBILE_TABS.map(t => [t.path, t.labelKey])).toEqual([
      ['/', 'nav.home'],           // en el sidebar es `nav.dashboard`
      ['/workout', 'nav.workout'],
      ['/feed', 'nav.activity'],
      ['/progress', 'nav.progress'],
      ['/profile', 'nav.profile'],
    ])
  })

  it('deriva el sidebar agrupado y deja fuera lo que no se lista', () => {
    expect(NAV_SECTIONS.map(s => s.labelKey)).toEqual([
      'nav.sectionTraining', 'nav.sectionTracking', 'nav.sectionExplore', 'nav.sectionSocial',
    ])
    expect(NAV_SECTIONS.map(s => s.items.map(i => i.path))).toEqual([
      ['/', '/workout', '/free-session', '/log-workout', '/cardio', '/circuit', '/lumbar'],
      ['/progress', '/nutrition', '/sleep', '/calendar', '/reminders'],
      ['/programs', '/exercises'],
      ['/friends', '/challenges', '/community-programs', '/leaderboard', '/referrals'],
    ])
    // Se llega a estas por la barra inferior, la campana o el avatar.
    const inSidebar = NAV_SECTIONS.flatMap(s => s.items.map(i => i.path))
    expect(inSidebar).not.toContain('/feed')
    expect(inSidebar).not.toContain('/notifications')
    expect(inSidebar).not.toContain('/profile')
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
