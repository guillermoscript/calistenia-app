/**
 * Registro único de rutas de navegación (issue #488).
 *
 * Antes había tres listas mantenidas a mano en `App.tsx` — `NAV_ITEMS` (20
 * entradas, para el breadcrumb), `MOBILE_TABS` (5, barra inferior) y
 * `NAV_SECTIONS` (19, sidebar) — y ya habían divergido: `NAV_SECTIONS` tenía
 * `/reminders` y `/log-workout` que `NAV_ITEMS` no tenía, y `NAV_ITEMS` tenía
 * `/notifications` que no salía en el sidebar. Cada ruta nueva había que
 * acordarse de darla de alta en las tres.
 *
 * Ahora hay una lista y las tres se derivan de ella, así que una ruta solo se
 * declara una vez y dónde aparece es un campo, no un olvido.
 */
import type React from 'react'

import {
  type IconProps,
  LayoutIcon, DumbbellIcon, SpineIcon, ChartIcon, NutritionIcon,
  ProfileIcon, ProgramIcon, ExerciseIcon, RunningIcon, ChallengeIcon,
  ActivityIcon, FriendsIcon, TrophyIcon, FreeSessionIcon, CalendarNavIcon,
  PencilIcon, SleepIcon, BellIcon, ReferralIcon, CircuitIcon,
} from '../components/icons/nav-icons'

export interface NavItem {
  path: string
  labelKey: string
  icon: React.FC<IconProps>
}

/** Secciones del sidebar, en orden de aparición. */
export const NAV_SECTION_KEYS = ['training', 'tracking', 'explore', 'social'] as const
export type NavSectionKey = (typeof NAV_SECTION_KEYS)[number]

const SECTION_LABEL: Record<NavSectionKey, string> = {
  training: 'nav.sectionTraining',
  tracking: 'nav.sectionTracking',
  explore: 'nav.sectionExplore',
  social: 'nav.sectionSocial',
}

interface NavRoute extends NavItem {
  /** Sección del sidebar. `null` = la ruta existe pero no se lista en el sidebar. */
  section: NavSectionKey | null
  /** Posición en la barra inferior de móvil, con su etiqueta propia. Ausente = no es tab. */
  tab?: { order: number; labelKey: string }
  /**
   * `false` saca la ruta de la búsqueda exacta del breadcrumb, para las que
   * `getBreadcrumbKey` resuelve con una clave distinta a la del menú.
   */
  inBreadcrumbs?: false
}

/** Orden de esta lista = orden del sidebar dentro de cada sección. */
const NAV_ROUTES: NavRoute[] = [
  // Entrenamiento
  { path: '/',                   labelKey: 'nav.dashboard',   icon: LayoutIcon,       section: 'training', tab: { order: 0, labelKey: 'nav.home' } },
  { path: '/workout',            labelKey: 'nav.workout',     icon: DumbbellIcon,     section: 'training', tab: { order: 1, labelKey: 'nav.workout' } },
  { path: '/free-session',       labelKey: 'nav.freeSession', icon: FreeSessionIcon,  section: 'training' },
  // El breadcrumb la nombra `breadcrumb.logWorkout`, no `nav.logWorkout`.
  { path: '/log-workout',        labelKey: 'nav.logWorkout',  icon: PencilIcon,       section: 'training', inBreadcrumbs: false },
  { path: '/cardio',             labelKey: 'nav.cardio',      icon: RunningIcon,      section: 'training' },
  { path: '/circuit',            labelKey: 'nav.circuit',     icon: CircuitIcon,      section: 'training' },
  { path: '/lumbar',             labelKey: 'nav.lumbar',      icon: SpineIcon,        section: 'training' },

  // Seguimiento
  { path: '/progress',           labelKey: 'nav.progress',    icon: ChartIcon,        section: 'tracking', tab: { order: 3, labelKey: 'nav.progress' } },
  { path: '/nutrition',          labelKey: 'nav.nutrition',   icon: NutritionIcon,    section: 'tracking' },
  { path: '/sleep',              labelKey: 'nav.sleep',       icon: SleepIcon,        section: 'tracking' },
  { path: '/calendar',           labelKey: 'nav.calendar',    icon: CalendarNavIcon,  section: 'tracking' },
  { path: '/reminders',          labelKey: 'nav.reminders',   icon: BellIcon,         section: 'tracking' },

  // Explorar
  { path: '/programs',           labelKey: 'nav.programs',    icon: ProgramIcon,      section: 'explore' },
  { path: '/exercises',          labelKey: 'nav.exercises',   icon: ExerciseIcon,     section: 'explore' },

  // Social
  { path: '/friends',            labelKey: 'nav.friends',            icon: FriendsIcon,     section: 'social' },
  { path: '/challenges',         labelKey: 'nav.challenges',         icon: ChallengeIcon,   section: 'social' },
  { path: '/community-programs', labelKey: 'nav.communityPrograms',  icon: CalendarNavIcon, section: 'social' },
  { path: '/leaderboard',        labelKey: 'nav.leaderboard',        icon: TrophyIcon,      section: 'social' },
  { path: '/referrals',          labelKey: 'nav.referrals',          icon: ReferralIcon,    section: 'social' },

  // Fuera del sidebar: se llega por la barra inferior, la campana o el avatar.
  { path: '/feed',               labelKey: 'nav.activity',      icon: ActivityIcon, section: null, tab: { order: 2, labelKey: 'nav.activity' } },
  { path: '/notifications',      labelKey: 'nav.notifications', icon: BellIcon,     section: null },
  { path: '/profile',            labelKey: 'nav.profile',       icon: ProfileIcon,  section: null, tab: { order: 4, labelKey: 'nav.profile' } },
]

/** Búsqueda exacta path → clave de etiqueta que usa el breadcrumb. */
export const NAV_ITEMS: NavItem[] = NAV_ROUTES
  .filter(route => route.inBreadcrumbs !== false)
  .map(({ path, labelKey, icon }) => ({ path, labelKey, icon }))

/** Barra de pestañas inferior de móvil. */
export const MOBILE_TABS: NavItem[] = NAV_ROUTES
  .filter((route): route is NavRoute & { tab: NonNullable<NavRoute['tab']> } => route.tab != null)
  .sort((a, b) => a.tab.order - b.tab.order)
  .map(({ path, tab, icon }) => ({ path, labelKey: tab.labelKey, icon }))

/** Secciones del sidebar, ya agrupadas. */
export const NAV_SECTIONS: { labelKey: string; items: NavItem[] }[] = NAV_SECTION_KEYS.map(key => ({
  labelKey: SECTION_LABEL[key],
  items: NAV_ROUTES
    .filter(route => route.section === key)
    .map(({ path, labelKey, icon }) => ({ path, labelKey, icon })),
}))
