/**
 * Contrato de analítica del nuevo inicio «qué hago hoy» (#854, épica #852).
 *
 * Existe para poder decir si el rediseño ha funcionado: el informe
 * antes/después mide el % del botón principal por estado, el tiempo hasta el
 * primer toque y el uso de «Para ti». Web (#855) y móvil (#858) emiten con
 * estos helpers y NO con `op.track` a pelo, para que los nombres y los valores
 * sean los mismos en las dos plataformas.
 *
 * Todo pasa por `trackCanonicalEvent`, así que cada evento lleva además
 * `event_version`, `platform` (web | mobile) y `surface: 'home'`.
 */
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from './analytics'

/**
 * Estados del bloque «Hoy», en el orden de precedencia de `getHomeState`
 * (#853). Es el valor de la propiedad `state` en todos los eventos del inicio.
 * El `kind` de `HomeState` tiene que ser asignable a `HomeAnalyticsState`: si
 * #853 añade un estado, se añade aquí y el test del contrato lo recuerda.
 */
export const HOME_ANALYTICS_STATES = [
  'in_progress',
  'program_complete',
  'no_program',
  'first_workout',
  'comeback',
  'done_today',
  'week_complete',
  'rest_day',
  'training_day',
] as const

export type HomeAnalyticsState = typeof HOME_ANALYTICS_STATES[number]

/**
 * Modificadores que se suman a cualquier estado. `loading` no está: el inicio
 * no emite `home_viewed` hasta que el estado se ha resuelto.
 * - `deload`: semana de descarga.
 * - `first_week`: ventana de activación abierta (meta «3 en 7 días»).
 * - `inactive`: 3-6 días sin entrenar («Llevas N días sin entrenar»).
 * - `offline` / `unsynced`: franja de arriba.
 * - `cardio`: variante de cardio de `done_today` / `training_day`.
 */
export const HOME_ANALYTICS_MODIFIERS = [
  'deload',
  'first_week',
  'inactive',
  'offline',
  'unsynced',
  'cardio',
] as const

export type HomeAnalyticsModifier = typeof HOME_ANALYTICS_MODIFIERS[number]

/** Filas de «Para ti» (`getParaTi`, #853), en su orden de prioridad. */
export const HOME_PARA_TI_KINDS = [
  'battle',
  'challenge',
  'friends',
  'nutrition',
  'photos',
  'featured_challenge',
  'community_program',
] as const

export type HomeParaTiKind = typeof HOME_PARA_TI_KINDS[number]

/**
 * `getParaTi` (#853) nombra algunas filas por lo que enseñan
 * (`friends_today`, `phase_photos`…). En analítica va el nombre corto de la
 * tabla de #854, que es el que leerá el informe. La traducción vive aquí para
 * que web y móvil no escriban cada una la suya.
 */
const PARA_TI_KIND_ALIASES = {
  challenge_progress: 'challenge',
  friends_today: 'friends',
  nutrition_today: 'nutrition',
  phase_photos: 'photos',
} as const satisfies Record<string, HomeParaTiKind>

/** Lo que devuelve `getParaTi`, o ya el nombre de analítica. */
export type HomeParaTiSourceKind = HomeParaTiKind | keyof typeof PARA_TI_KIND_ALIASES

export function toHomeParaTiKind(kind: HomeParaTiSourceKind): HomeParaTiKind {
  return kind in PARA_TI_KIND_ALIASES
    ? PARA_TI_KIND_ALIASES[kind as keyof typeof PARA_TI_KIND_ALIASES]
    : kind as HomeParaTiKind
}

/**
 * Acciones secundarias de los estados. La lista es abierta en la issue
 * («…»): si un tablero trae una acción nueva, se añade aquí antes de emitirla,
 * nunca con un string suelto desde la app.
 */
export const HOME_SECONDARY_TARGETS = [
  'summary',
  'share',
  'repeat',
  'next_day',
  'other_program',
] as const

export type HomeSecondaryTarget = typeof HOME_SECONDARY_TARGETS[number]

/**
 * Los modificadores viajan como UN string ordenado y separado por comas
 * (`deload,first_week`), o `none`. OpenPanel aplana los arrays en
 * `modifiers.0`, `modifiers.1`…, y así no hay forma de filtrar «lleva
 * `deload`»; con el string basta el operador «contiene». Ordenar y quitar
 * duplicados hace que la misma combinación dé siempre el mismo valor.
 */
export function serializeHomeModifiers(modifiers: readonly HomeAnalyticsModifier[]): string {
  const unique = [...new Set(modifiers)].sort()
  return unique.length ? unique.join(',') : 'none'
}

/**
 * Forma mínima de `HomeState` (#853) que hace falta para los modificadores.
 * Es estructural a propósito: el contrato no depende de `homeState.ts`, y
 * cualquier `HomeState` encaja tal cual.
 */
export interface HomeStateForAnalytics {
  kind: HomeAnalyticsState
  modifiers: {
    inactiveDays: number | null
    firstWeek: unknown
    offline: boolean
    unsynced: boolean
  }
  /** Solo en `training_day`. */
  deload?: boolean
  /** Solo en `done_today`. */
  variant?: string
  day?: { dayType?: string } | null
}

/** Modificadores de analítica de un `HomeState`, para `trackHomeViewed`. */
export function homeAnalyticsModifiers(state: HomeStateForAnalytics): HomeAnalyticsModifier[] {
  const out: HomeAnalyticsModifier[] = []
  if (state.deload) out.push('deload')
  if (state.modifiers.firstWeek) out.push('first_week')
  if (state.modifiers.inactiveDays != null) out.push('inactive')
  if (state.modifiers.offline) out.push('offline')
  if (state.modifiers.unsynced) out.push('unsynced')
  const isCardio = state.kind === 'done_today'
    ? state.variant === 'cardio'
    : state.kind === 'training_day' && state.day?.dayType === 'cardio'
  if (isCardio) out.push('cardio')
  return out
}

/**
 * Momento del último `home_viewed`, para el «tiempo hasta el primer toque».
 * Variable de módulo por la misma razón que `analyticsProgramId`: solo se lee
 * al emitir y hay un único inicio a la vez.
 */
let lastHomeViewedAt: number | null = null

/** Milisegundos desde el último `home_viewed`, o `undefined` si no hubo. */
function msSinceHomeViewed(): number | undefined {
  return lastHomeViewedAt == null ? undefined : Math.max(0, Date.now() - lastHomeViewedAt)
}

/**
 * `home_viewed`: una vez por VISITA al inicio, con el estado ya resuelto (no
 * durante `loading`) y nunca en cada render. En web, al montar la ruta `/`; en
 * móvil, al enfocar la pestaña (la pestaña no se desmonta al salir).
 */
export function trackHomeViewed(properties: {
  state: HomeAnalyticsState
  modifiers?: readonly HomeAnalyticsModifier[]
}): unknown {
  lastHomeViewedAt = Date.now()
  return trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.homeViewed, {
    surface: 'home',
    state: properties.state,
    modifiers: serializeHomeModifiers(properties.modifiers ?? []),
  })
}

/** `home_primary_cta`: el botón principal del bloque «Hoy». */
export function trackHomePrimaryCta(properties: { state: HomeAnalyticsState }): unknown {
  return trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.homePrimaryCta, {
    surface: 'home',
    state: properties.state,
    ms_since_view: msSinceHomeViewed(),
  })
}

/** `home_change_day`: «Cambiar día». */
export function trackHomeChangeDay(): unknown {
  return trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.homeChangeDay, {
    surface: 'home',
    ms_since_view: msSinceHomeViewed(),
  })
}

/** `home_para_ti_tap`: una fila de «Para ti». Acepta el `kind` de `getParaTi` tal cual. */
export function trackHomeParaTiTap(properties: { kind: HomeParaTiSourceKind }): unknown {
  return trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.homeParaTiTap, {
    surface: 'home',
    kind: toHomeParaTiKind(properties.kind),
    ms_since_view: msSinceHomeViewed(),
  })
}

/** `home_secondary_tap`: una acción secundaria del estado. */
export function trackHomeSecondaryTap(properties: {
  target: HomeSecondaryTarget
  state: HomeAnalyticsState
}): unknown {
  return trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.homeSecondaryTap, {
    surface: 'home',
    target: properties.target,
    state: properties.state,
    ms_since_view: msSinceHomeViewed(),
  })
}

/** Solo para tests: olvida el último `home_viewed`. */
export function __resetHomeAnalyticsForTests(): void {
  lastHomeViewedAt = null
}
