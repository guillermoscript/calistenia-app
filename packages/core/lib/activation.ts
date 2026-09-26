/**
 * Objetivo de activación «3 entrenos en tus primeros 7 días» (#800).
 *
 * Es el número mágico de activación de las apps de fitness y la métrica norte
 * de la fase 2 de retención (#794). Aquí vive la derivación pura; la tarjeta
 * del inicio (web y móvil) solo pinta este estado.
 *
 * Decisiones:
 * - Se mide activación TEMPRANA: la ventana son los 7 días naturales que
 *   empiezan el día del alta (día 0 … día 6). Una 3.ª sesión el día 7 o
 *   después NO activa — si no, «3 entrenos alguna vez» lo acabaría cumpliendo
 *   casi todo el que se queda, y dejaría de distinguir a quien engancha pronto.
 * - Cuentan DÍAS con entreno, no sesiones: repetir el mismo día no infla el
 *   contador (mismo criterio que la racha de `pb_hooks/utils/workout_stats.js`).
 * - Sin `Date.now()` dentro: el «hoy» llega por parámetro, igual que en
 *   `programProgress.ts`.
 */
import { CANONICAL_ANALYTICS_EVENTS, emitOnce, trackCanonicalEvent } from './analytics'

export const ACTIVATION_TARGET_SESSIONS = 3
export const ACTIVATION_WINDOW_DAYS = 7

export interface ActivationInputs {
  /** Días con al menos una sesión completada, 'YYYY-MM-DD' en hora local. Los repetidos se ignoran. */
  sessionDays: Iterable<string>
  /** Día local del alta, 'YYYY-MM-DD'. `null` si no se conoce (no hay ventana). */
  signupDay: string | null
  /** Hoy, 'YYYY-MM-DD' en hora local. */
  today: string
}

export interface ActivationState {
  /** Días distintos con entreno dentro de la ventana. Puede pasar de 3. */
  sessionsInFirst7Days: number
  /** Días de la ventana que quedan contando hoy (7 el día del alta, 0 cuando se cerró). */
  daysRemaining: number
  /** La 3.ª sesión cayó dentro de la ventana. */
  reached: boolean
  /** Día en que se alcanzó el objetivo (el de la 3.ª sesión), o null. */
  reachedDay: string | null
  /** Días desde el alta hasta `reachedDay` (0-6), o null. */
  daysSinceSignupAtReach: number | null
}

export type ActivationCardMode = 'hidden' | 'start' | 'progress' | 'completed'

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** Número de día absoluto de un 'YYYY-MM-DD', sin depender de la zona horaria. */
function dayNumber(day: string): number {
  const [y, m, d] = day.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

export function deriveActivation({ sessionDays, signupDay, today }: ActivationInputs): ActivationState {
  const empty: ActivationState = {
    sessionsInFirst7Days: 0,
    daysRemaining: 0,
    reached: false,
    reachedDay: null,
    daysSinceSignupAtReach: null,
  }
  if (!signupDay || !DAY_RE.test(signupDay) || !DAY_RE.test(today)) return empty

  const start = dayNumber(signupDay)
  const end = start + ACTIVATION_WINDOW_DAYS - 1

  const inWindow = [...new Set(sessionDays)]
    .filter(day => DAY_RE.test(day))
    .filter(day => {
      const n = dayNumber(day)
      return n >= start && n <= end
    })
    .sort()

  const todayN = dayNumber(today)
  // Un reloj que va por detrás del alta cuenta como el día 0, no como ventana cerrada.
  const daysRemaining = todayN > end ? 0 : end - Math.max(todayN, start) + 1

  const reachedDay = inWindow.length >= ACTIVATION_TARGET_SESSIONS
    ? inWindow[ACTIVATION_TARGET_SESSIONS - 1]
    : null

  return {
    sessionsInFirst7Days: inWindow.length,
    daysRemaining,
    reached: reachedDay !== null,
    reachedDay,
    daysSinceSignupAtReach: reachedDay ? dayNumber(reachedDay) - start : null,
  }
}

/**
 * Qué enseña la tarjeta del inicio:
 * - `start`: ventana abierta y 0 entrenos (0/3).
 * - `progress`: ventana abierta y 1-2 entrenos (1/3, 2/3).
 * - `completed`: objetivo alcanzado, solo el mismo día en que se alcanzó —
 *   la celebración no ocupa el inicio el resto de la semana.
 * - `hidden`: todo lo demás (ventana cerrada sin llegar, o celebración pasada).
 */
export function activationCardMode(state: ActivationState, today: string): ActivationCardMode {
  if (state.reached) return state.reachedDay === today ? 'completed' : 'hidden'
  if (state.daysRemaining <= 0) return 'hidden'
  return state.sessionsInFirst7Days === 0 ? 'start' : 'progress'
}

/**
 * Tramo del inicio simplificado (#808), con el mismo umbral que el objetivo:
 * - `first`: 0 entrenos → solo «hoy toca X» y el plan de la semana.
 * - `early`: 1-2 → además la racha y el progreso hacia el 3.º.
 * - `full`: 3 o más → el inicio completo.
 *
 * A diferencia de la tarjeta, aquí cuentan los entrenos de TODA la vida de la
 * cuenta, no los días de la primera semana: el inicio se simplifica «hasta el
 * 3.er entreno», caiga cuando caiga.
 */
export type HomeStage = 'first' | 'early' | 'full'

export function homeStage(totalSessions: number): HomeStage {
  if (!(totalSessions > 0)) return 'first'
  return totalSessions < ACTIVATION_TARGET_SESSIONS ? 'early' : 'full'
}

export interface HomeStageInputs {
  /**
   * `getTotalSessions()`: entrenos del programa ACTIVO (más los sin programa).
   * Se queda en 0 al cambiar de programa, así que no basta por sí solo.
   */
  programSessions: number
  /** `user_stats.total_sessions`, el contador de toda la cuenta. `null` mientras carga. */
  lifetimeSessions: number | null | undefined
  /** El flag de `homeFullKey`: este dispositivo ya vio al usuario llegar a 3. */
  reachedBefore: boolean
}

export interface HomeStageView {
  stage: HomeStage
  /** Entrenos conocidos: el mayor de los dos contadores. */
  sessions: number
}

/**
 * Junta los dos contadores y el flag. Mientras el del servidor carga manda el
 * del programa: quien acaba de darse de alta —el caso para el que existe el
 * inicio simple— lo ve sin esperar a la red.
 */
export function resolveHomeStage({ programSessions, lifetimeSessions, reachedBefore }: HomeStageInputs): HomeStageView {
  const sessions = Math.max(programSessions || 0, lifetimeSessions || 0)
  return { stage: reachedBefore ? 'full' : homeStage(sessions), sessions }
}

/**
 * Flag «ya llegó al inicio completo», por usuario y dispositivo. Haber hecho 3
 * entrenos es un hecho que no caduca, así que guardarlo no puede quedarse
 * viejo; evita el parpadeo del inicio simple mientras llega el contador del
 * servidor.
 */
export const homeFullKey = (userId: string): string => `calistenia_home_full_${userId}`

/** Preferencia «ver el inicio completo» antes del 3.er entreno, por usuario y dispositivo. */
export const homeShowAllKey = (userId: string): string => `calistenia_home_show_all_${userId}`

/** Clave de storage del flag «`activation_reached` ya emitido», por usuario y dispositivo. */
export const activationReachedKey = (userId: string): string =>
  `calistenia_activation_reached_${userId}`

/**
 * Emite `activation_reached` una sola vez por usuario (flag en storage, mismo
 * patrón que el checklist). No hace nada si el objetivo no se alcanzó dentro
 * de la ventana. El flag es por dispositivo: quien alterne web y móvil puede
 * emitirlo una vez en cada uno — el informe cuenta perfiles únicos.
 */
export function trackActivationReached(
  userId: string | null | undefined,
  state: ActivationState,
  programId: string | null,
): void {
  if (!userId || !state.reached) return
  emitOnce(activationReachedKey(userId), () => {
    trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.activationReached, {
      surface: 'home',
      sessions_count: ACTIVATION_TARGET_SESSIONS,
      days_since_signup: state.daysSinceSignupAtReach,
      program_id: programId ?? undefined,
    })
  })
}
