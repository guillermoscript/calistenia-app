/**
 * Primer entreno del día 0 (#694).
 *
 * El onboarding terminaba en el home: el usuario había «configurado» pero no
 * «entrenado», y 37 de 46 no volvían. Esto construye una sesión corta —cuatro
 * ejercicios sin material, dos series, ~6 min— para cerrarla en el mismo
 * momento en que se acaba el onboarding.
 *
 * Es una sesión LIBRE a todos los efectos (`source: 'free'`, clave `free_…`):
 * historial, estadísticas y `isFreeSessionKey` la tratan como cualquier otra.
 * Solo el prefijo de la clave la distingue en analytics.
 *
 * Los ids son los del catálogo empaquetado, así que media, progresión y la
 * identidad de `sets_log` siguen funcionando. Los nombres salen del índice del
 * catálogo cuando está cargado (en móvil siempre; en web es perezoso, #486) y
 * de los fallbacks embebidos si no: la sesión nunca depende de una carga.
 *
 * Sin React a propósito: se prueba sin montar nada y lo consumen las dos apps.
 */
import { storage } from '../platform'
import type { Exercise, Workout } from '../types'
import { op } from './analytics'
import { getCatalogIndexSync } from './catalogIndex'
import { localize, type TranslatableField } from './i18n-db'

/** Nivel tal y como lo guarda el onboarding (`users.level`). */
export type FirstWorkoutLevel = 'principiante' | 'intermedio' | 'avanzado'

/** Prefijo de la clave de sesión: sigue siendo `free_…` para el resto de la app. */
export const FIRST_WORKOUT_KEY_PREFIX = 'free_first_'

/** Descanso corto: el objetivo del día 0 es acabar, no rendir. */
const REST_SECONDS = 30

interface FirstWorkoutEntry {
  id: string
  /** Fallback si el catálogo no está cargado (web antes de `loadCatalogIndex`). */
  name: TranslatableField
  muscles: TranslatableField
  sets: number
  reps: string
  isTimer?: boolean
  timerSeconds?: number
}

const PLANK_BEGINNER: FirstWorkoutEntry = {
  id: 'plank',
  name: { es: 'Plancha', en: 'Plank' },
  muscles: { es: 'Core', en: 'Core' },
  sets: 2, reps: '20s', isTimer: true, timerSeconds: 20,
}

/**
 * Cuatro ejercicios por nivel, todos con `equipment: ['ninguno']` en el
 * catálogo. El orden es piernas → empuje → cadena posterior/core, como un
 * día «full» en miniatura.
 */
const FIRST_WORKOUTS: Record<FirstWorkoutLevel, FirstWorkoutEntry[]> = {
  principiante: [
    { id: 'bodyweight_squat', name: { es: 'Sentadilla', en: 'Bodyweight squat' }, muscles: { es: 'Piernas, glúteos', en: 'Legs, glutes' }, sets: 2, reps: '10' },
    { id: 'knee_push_up', name: { es: 'Flexión de rodillas', en: 'Knee push-up' }, muscles: { es: 'Pecho, tríceps', en: 'Chest, triceps' }, sets: 2, reps: '8' },
    { id: 'glute_bridge', name: { es: 'Puente de glúteo', en: 'Glute bridge' }, muscles: { es: 'Glúteos, lumbar', en: 'Glutes, lower back' }, sets: 2, reps: '12' },
    PLANK_BEGINNER,
  ],
  intermedio: [
    { id: 'bodyweight_squat', name: { es: 'Sentadilla', en: 'Bodyweight squat' }, muscles: { es: 'Piernas, glúteos', en: 'Legs, glutes' }, sets: 2, reps: '15' },
    { id: 'pushup_std', name: { es: 'Flexión', en: 'Push-up' }, muscles: { es: 'Pecho, hombros, tríceps', en: 'Chest, shoulders, triceps' }, sets: 2, reps: '10' },
    { id: 'reverse_lunge', name: { es: 'Zancada atrás', en: 'Reverse lunge' }, muscles: { es: 'Piernas, glúteos', en: 'Legs, glutes' }, sets: 2, reps: '8/lado' },
    { id: 'plank', name: { es: 'Plancha', en: 'Plank' }, muscles: { es: 'Core', en: 'Core' }, sets: 2, reps: '30s', isTimer: true, timerSeconds: 30 },
  ],
  avanzado: [
    { id: 'jump_squat', name: { es: 'Sentadilla con salto', en: 'Jump squat' }, muscles: { es: 'Piernas, glúteos', en: 'Legs, glutes' }, sets: 2, reps: '10' },
    { id: 'diamond_pushup', name: { es: 'Flexión diamante', en: 'Diamond push-up' }, muscles: { es: 'Tríceps, pecho', en: 'Triceps, chest' }, sets: 2, reps: '10' },
    { id: 'pike_pushup', name: { es: 'Flexión pike', en: 'Pike push-up' }, muscles: { es: 'Hombros, tríceps', en: 'Shoulders, triceps' }, sets: 2, reps: '8' },
    { id: 'hollow_hold', name: { es: 'Hollow hold', en: 'Hollow hold' }, muscles: { es: 'Core', en: 'Core' }, sets: 2, reps: '25s', isTimer: true, timerSeconds: 25 },
  ],
}

/** Ids del catálogo que usa el primer entreno (para el test de integridad). */
export const FIRST_WORKOUT_EXERCISE_IDS: readonly string[] = Array.from(
  new Set(Object.values(FIRST_WORKOUTS).flat().map(e => e.id)),
)

/** Normaliza lo que llegue de `users.level` / el onboarding a un nivel conocido. */
export function normalizeFirstWorkoutLevel(level: string | null | undefined): FirstWorkoutLevel {
  if (level === 'intermedio' || level === 'avanzado') return level
  return 'principiante'
}

/** Título de la sesión, localizado. */
export function firstWorkoutTitle(locale: string): string {
  return localize({ es: 'Tu primer entreno', en: 'Your first workout' }, locale)
}

/** Una serie de 8-15 repeticiones a ritmo tranquilo ronda los 25 s. */
const SECONDS_PER_REP_SET = 25

/**
 * Minutos estimados de la sesión: ~25 s por serie (o la duración del
 * temporizador) más los descansos. Es la promesa del CTA («· 7 MIN»), así que
 * redondea al entero más cercano y no infla.
 */
export function estimateFirstWorkoutMinutes(level: FirstWorkoutLevel = 'principiante'): number {
  const entries = FIRST_WORKOUTS[level]
  const sets = entries.reduce((n, e) => n + e.sets, 0)
  const work = entries.reduce((n, e) => n + e.sets * (e.timerSeconds ?? SECONDS_PER_REP_SET), 0)
  const rest = (sets - 1) * REST_SECONDS
  return Math.max(1, Math.round((work + rest) / 60))
}

/**
 * Construye el `Workout` del primer entreno para un nivel e idioma.
 *
 * Con el índice del catálogo cargado toma nombre y músculos de allí (es lo que
 * pinta el resto de la app); si no, de los fallbacks embebidos.
 */
export function buildFirstWorkout(level: string | null | undefined, locale: string): Workout {
  const lv = normalizeFirstWorkoutLevel(level)
  const index = getCatalogIndexSync()
  const exercises: Exercise[] = FIRST_WORKOUTS[lv].map(entry => {
    const cat = index?.byId.get(entry.id)
    return {
      id: entry.id,
      name: localize(cat?.name ?? entry.name, locale),
      sets: entry.sets,
      reps: entry.reps,
      rest: REST_SECONDS,
      muscles: localize(cat?.muscles ?? entry.muscles, locale),
      note: '',
      youtube: cat?.youtube_search || cat?.youtube_query || '',
      priority: 'med',
      isTimer: entry.isTimer,
      timerSeconds: entry.timerSeconds,
      equipment: ['ninguno'],
      difficulty: lv === 'principiante' ? 'beginner' : lv === 'intermedio' ? 'intermediate' : 'advanced',
      section: 'main',
    }
  })
  return { phase: 0, day: 'lun', title: firstWorkoutTitle(locale), exercises }
}

/** Clave de sesión de un primer entreno: `free_first_<ts>`. */
export function firstWorkoutKey(now: number = Date.now()): string {
  return `${FIRST_WORKOUT_KEY_PREFIX}${now}`
}

export function isFirstWorkoutKey(workoutKey: string): boolean {
  return workoutKey.startsWith(FIRST_WORKOUT_KEY_PREFIX)
}

// ── Handoff onboarding → sesión (web) ────────────────────────────────────────
//
// En web el onboarding se pinta FUERA de `ActiveSessionProvider` (App.tsx lo
// devuelve antes de montar el árbol con providers), así que no puede llamar a
// `startSession`. Deja la intención en storage y `/session` la consume una vez.

/** Un solo uso y ligado al usuario: se limpia al cerrar sesión (storage-keys). */
export const FIRST_WORKOUT_PENDING_KEY = 'calistenia_first_workout_pending'

export interface FirstWorkoutPending {
  userId: string
  level: FirstWorkoutLevel
  /** De dónde salió la intención — viaja al evento `first_workout_started`. */
  source: FirstWorkoutSource
  createdAt: number
}

export type FirstWorkoutSource = 'onboarding' | 'home'

/** La intención caduca: si no se consumió en unos minutos, no debe arrancar sola. */
const PENDING_TTL_MS = 10 * 60 * 1000

export function markFirstWorkoutPending(
  userId: string,
  level: string | null | undefined,
  source: FirstWorkoutSource = 'onboarding',
): void {
  const pending: FirstWorkoutPending = {
    userId, level: normalizeFirstWorkoutLevel(level), source, createdAt: Date.now(),
  }
  storage.setItem(FIRST_WORKOUT_PENDING_KEY, JSON.stringify(pending))
}

/**
 * Devuelve la intención pendiente para este usuario y la borra. `null` si no
 * hay, si es de otro usuario o si caducó (en esos casos también se borra).
 */
export function takeFirstWorkoutPending(userId: string | null | undefined, now: number = Date.now()): FirstWorkoutPending | null {
  // Sin usuario todavía (auth aún resolviéndose) no se consume: si se borrara
  // aquí, el siguiente render con usuario ya no encontraría la intención.
  if (!userId) return null
  const raw = storage.getItem(FIRST_WORKOUT_PENDING_KEY)
  if (!raw) return null
  storage.removeItem(FIRST_WORKOUT_PENDING_KEY)
  try {
    const parsed = JSON.parse(raw) as Partial<FirstWorkoutPending>
    if (parsed.userId !== userId) return null
    if (typeof parsed.createdAt !== 'number' || now - parsed.createdAt > PENDING_TTL_MS) return null
    return {
      userId,
      level: normalizeFirstWorkoutLevel(parsed.level),
      source: parsed.source === 'home' ? 'home' : 'onboarding',
      createdAt: parsed.createdAt,
    }
  } catch {
    return null
  }
}

// ── Analytics ────────────────────────────────────────────────────────────────

/**
 * `first_workout_started` — el eslabón que faltaba entre `onboarding_completed`
 * y `session_started` (#694 «cómo medirlo»). Se emite ADEMÁS de
 * `session_started`, que sigue saliendo del engine con `source: 'free'`.
 */
export function trackFirstWorkoutStarted(props: { source: FirstWorkoutSource; level: FirstWorkoutLevel; workoutKey: string }): void {
  op.track('first_workout_started', {
    source: props.source,
    level: props.level,
    workout_key: props.workoutKey,
    exercise_count: FIRST_WORKOUTS[props.level].length,
    estimated_minutes: estimateFirstWorkoutMinutes(props.level),
  })
}
