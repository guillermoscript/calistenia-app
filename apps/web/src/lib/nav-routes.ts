/**
 * Registro único de rutas de navegación (issue #488).
 *
 * Antes había tres listas mantenidas a mano en `App.tsx` — `NAV_ITEMS` (para
 * el breadcrumb), `MOBILE_TABS` (barra inferior) y `NAV_SECTIONS` (sidebar) —
 * y ya habían divergido. Ahora hay una lista y las tres se derivan de ella, así
 * que una ruta solo se declara una vez y dónde aparece es un campo, no un olvido.
 *
 * Desde #856 la navegación son 5 destinos iguales en web y móvil (Hoy ·
 * Entrenar · Nutrición · Progreso · Comunidad) más tres atajos en el sidebar de
 * escritorio. Las demás rutas siguen existiendo (enlaces compartidos, push) y
 * se llega a ellas desde esas pantallas; aquí solo dan nombre al breadcrumb y,
 * con `activeFor`, dicen qué pestaña queda marcada mientras estás en ellas.
 */
import type React from 'react'

import {
  type IconProps,
  HomeIcon, DumbbellIcon, SpineIcon, ChartIcon, NutritionIcon,
  ProfileIcon, ProgramIcon, ExerciseIcon, RunningIcon, ChallengeIcon,
  ActivityIcon, FriendsIcon, TrophyIcon, FreeSessionIcon, CalendarNavIcon,
  PencilIcon, SleepIcon, BellIcon, ReferralIcon, CircuitIcon,
} from '../components/icons/nav-icons'

export interface NavItem {
  path: string
  labelKey: string
  icon: React.FC<IconProps>
  /** Prefijos de otras rutas que también marcan este destino como activo. */
  activeFor?: readonly string[]
}

/** Secciones del sidebar, en orden de aparición. */
export const NAV_SECTION_KEYS = ['main', 'shortcuts'] as const
export type NavSectionKey = (typeof NAV_SECTION_KEYS)[number]

/** `null` = sección sin título (los 5 destinos principales). */
const SECTION_LABEL: Record<NavSectionKey, string | null> = {
  main: null,
  shortcuts: 'nav.sectionShortcuts',
}

interface NavRoute extends NavItem {
  /** Sección del sidebar. `null` = la ruta existe pero no se lista en el sidebar. */
  section: NavSectionKey | null
  /** Posición en la barra inferior de móvil. Ausente = no es pestaña. */
  tabOrder?: number
  /**
   * `false` saca la ruta de la búsqueda exacta del breadcrumb, para las que
   * `getBreadcrumbKey` resuelve con una clave distinta a la del menú.
   */
  inBreadcrumbs?: false
}

/** Orden de esta lista = orden del sidebar dentro de cada sección. */
const NAV_ROUTES: NavRoute[] = [
  // Los 5 destinos: sidebar y barra inferior, con la misma etiqueta.
  { path: '/',          labelKey: 'nav.today',     icon: HomeIcon,      section: 'main', tabOrder: 0 },
  {
    path: '/workout',   labelKey: 'nav.workout',   icon: DumbbellIcon,  section: 'main', tabOrder: 1,
    activeFor: ['/free-session', '/log-workout', '/cardio', '/circuit', '/lumbar', '/programs', '/exercises'],
  },
  { path: '/nutrition', labelKey: 'nav.nutrition', icon: NutritionIcon, section: 'main', tabOrder: 2, activeFor: ['/pantry'] },
  { path: '/progress',  labelKey: 'nav.progress',  icon: ChartIcon,     section: 'main', tabOrder: 3, activeFor: ['/calendar', '/sleep', '/session/'] },
  {
    path: '/community', labelKey: 'nav.community', icon: FriendsIcon,   section: 'main', tabOrder: 4,
    activeFor: ['/feed', '/challenges', '/leaderboard', '/friends', '/referrals', '/community-programs', '/races', '/add/', '/u/'],
  },

  // Atajos del sidebar de escritorio.
  { path: '/free-session', labelKey: 'nav.freeSession',    icon: FreeSessionIcon, section: 'shortcuts' },
  { path: '/cardio',       labelKey: 'nav.cardioGps',      icon: RunningIcon,     section: 'shortcuts', inBreadcrumbs: false },
  // El breadcrumb la nombra `breadcrumb.logWorkout`, no la etiqueta del atajo.
  { path: '/log-workout',  labelKey: 'nav.logOutsideWorkout', icon: PencilIcon,  section: 'shortcuts', inBreadcrumbs: false },

  // Fuera de la navegación: se llega desde las pantallas destino, la campana o
  // el avatar. Siguen aquí para dar nombre al breadcrumb.
  { path: '/cardio',             labelKey: 'nav.cardio',            icon: RunningIcon,     section: null },
  { path: '/circuit',            labelKey: 'nav.circuit',           icon: CircuitIcon,     section: null },
  { path: '/lumbar',             labelKey: 'nav.lumbar',            icon: SpineIcon,       section: null },
  { path: '/sleep',              labelKey: 'nav.sleep',             icon: SleepIcon,       section: null },
  { path: '/calendar',           labelKey: 'nav.calendar',          icon: CalendarNavIcon, section: null },
  { path: '/reminders',          labelKey: 'nav.reminders',         icon: BellIcon,        section: null },
  { path: '/programs',           labelKey: 'nav.programs',          icon: ProgramIcon,     section: null },
  { path: '/exercises',          labelKey: 'nav.exercises',         icon: ExerciseIcon,    section: null },
  { path: '/friends',            labelKey: 'nav.friends',           icon: FriendsIcon,     section: null },
  { path: '/challenges',         labelKey: 'nav.challenges',        icon: ChallengeIcon,   section: null },
  { path: '/community-programs', labelKey: 'nav.communityPrograms', icon: CalendarNavIcon, section: null },
  { path: '/leaderboard',        labelKey: 'nav.leaderboard',       icon: TrophyIcon,      section: null },
  { path: '/referrals',          labelKey: 'nav.referrals',         icon: ReferralIcon,    section: null },
  { path: '/feed',               labelKey: 'nav.activity',          icon: ActivityIcon,    section: null },
  { path: '/notifications',      labelKey: 'nav.notifications',     icon: BellIcon,        section: null },
  { path: '/profile',            labelKey: 'nav.profileAndSettings', icon: ProfileIcon,    section: null },
]

const toItem = ({ path, labelKey, icon, activeFor }: NavRoute): NavItem =>
  activeFor ? { path, labelKey, icon, activeFor } : { path, labelKey, icon }

/** Búsqueda exacta path → clave de etiqueta que usa el breadcrumb. */
export const NAV_ITEMS: NavItem[] = NAV_ROUTES
  .filter(route => route.inBreadcrumbs !== false)
  .map(toItem)

/** Barra de pestañas inferior de móvil: los 5 destinos. */
export const MOBILE_TABS: NavItem[] = NAV_ROUTES
  .filter((route): route is NavRoute & { tabOrder: number } => route.tabOrder != null)
  .sort((a, b) => a.tabOrder - b.tabOrder)
  .map(toItem)

/** Secciones del sidebar, ya agrupadas. `labelKey: null` = sin título. */
export const NAV_SECTIONS: { key: NavSectionKey; labelKey: string | null; items: NavItem[] }[] = NAV_SECTION_KEYS.map(key => ({
  key,
  labelKey: SECTION_LABEL[key],
  items: NAV_ROUTES.filter(route => route.section === key).map(toItem),
}))

/**
 * ¿Marca `item` la ruta `pathname`? `/` solo en exacto; las demás por prefijo,
 * propio o de `activeFor`.
 */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.path === '/') return pathname === '/'
  // Un prefijo que acaba en `/` (`/u/`) solo casa con sus hijas; el resto, consigo
  // mismo y con sus hijas (`/programs` y `/programs/abc`, no `/programsx`).
  const matches = (prefix: string) => prefix.endsWith('/')
    ? pathname.startsWith(prefix)
    : pathname === prefix || pathname.startsWith(`${prefix}/`)
  return matches(item.path) || (item.activeFor ?? []).some(matches)
}
