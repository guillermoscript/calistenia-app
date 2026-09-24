/**
 * Primer entreno del día 0 (#694, recortado en #812).
 *
 * El onboarding terminaba en el home: el usuario había «configurado» pero no
 * «entrenado», y 37 de 46 no volvían. Esto construye una sesión corta —tres
 * ejercicios sin material, dos series, ~5 min— para cerrarla en el mismo
 * momento en que se acaba el onboarding.
 *
 * #812: el embudo mostraba 18 `first_workout_started` → solo 3
 * `workout_completed`. Dos ajustes sobre la versión original de cuatro
 * ejercicios: (1) cada ejercicio trae una nota de técnica pensada para
 * alguien que lo hace por primera vez —antes se escribía `note: ''` a
 * pelo—, y (2) cada nota incluye una regresión visible («si no te sale…»)
 * para no dejar a nadie atascado en el primer contacto con la app.
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
  /** Frase de técnica, pensada para alguien que hace este ejercicio por primera vez. */
  note: TranslatableField
  /**
   * La variante más fácil, en texto corto y con instrucción de cómo hacerla
   * (p. ej. «flexión con las rodillas apoyadas»). Es SIEMPRE lo que se
   * muestra, tenga o no `regressionId` — ver `regressionPhrase()`.
   */
  regression: TranslatableField
  /**
   * Solo cuando la regresión es un ejercicio del catálogo que no pide
   * material: sirve para validar su existencia en `FIRST_WORKOUT_EXERCISE_IDS`,
   * no decide el texto que se muestra (`regressionPhrase()` no lo consulta).
   */
  regressionId?: string
  sets: number
  reps: string
  isTimer?: boolean
  timerSeconds?: number
}

/**
 * Tres ejercicios por nivel, todos con `equipment: ['ninguno']` en el
 * catálogo. El orden es piernas → empuje → core, como un día «full» en
 * miniatura. Decisión de producto (#812): de los cuatro originales sale el
 * que menos aporta a ese patrón piernas→empuje→core en cada nivel
 * (`glute_bridge`, `reverse_lunge` y `pike_pushup` respectivamente).
 */
const FIRST_WORKOUTS: Record<FirstWorkoutLevel, FirstWorkoutEntry[]> = {
  principiante: [
    {
      id: 'bodyweight_squat',
      name: { es: 'Sentadilla', en: 'Bodyweight squat' },
      muscles: { es: 'Piernas, glúteos', en: 'Legs, glutes' },
      note: {
        es: 'Pies a la anchura de los hombros. Baja como si te sentaras en una silla, las rodillas no se meten hacia dentro.',
        en: 'Feet shoulder-width apart. Lower like sitting in a chair, knees don’t cave in.',
      },
      regression: {
        es: 'siéntate y levántate de una silla, o baja solo hasta la mitad',
        en: 'sit and stand up from a chair, or just go halfway down',
      },
      sets: 2, reps: '10',
    },
    {
      id: 'knee_push_up',
      name: { es: 'Flexión de rodillas', en: 'Knee push-up' },
      muscles: { es: 'Pecho, tríceps', en: 'Chest, triceps' },
      note: {
        es: 'Rodillas, caderas y hombros en línea recta. Baja el pecho casi hasta tocar el suelo.',
        en: 'Knees, hips and shoulders in a straight line. Lower your chest almost to the floor.',
      },
      regression: {
        es: 'flexión inclinada apoyando las manos en una mesa o el sofá',
        en: 'incline push-up with your hands on a table or the couch',
      },
      sets: 2, reps: '8',
    },
    {
      id: 'plank',
      name: { es: 'Plancha', en: 'Plank' },
      muscles: { es: 'Core', en: 'Core' },
      note: {
        es: 'Cuerpo en línea recta de la cabeza a los talones. No dejes caer las caderas.',
        en: 'Body in a straight line from head to heels. Don’t let your hips drop.',
      },
      regression: {
        es: 'plancha apoyando las rodillas en el suelo',
        en: 'plank with your knees on the floor',
      },
      sets: 2, reps: '20s', isTimer: true, timerSeconds: 20,
    },
  ],
  intermedio: [
    {
      id: 'bodyweight_squat',
      name: { es: 'Sentadilla', en: 'Bodyweight squat' },
      muscles: { es: 'Piernas, glúteos', en: 'Legs, glutes' },
      note: {
        es: 'Baja hasta que los muslos queden paralelos al suelo. Pecho arriba, peso en los talones.',
        en: 'Lower until your thighs are parallel to the floor. Chest up, weight on your heels.',
      },
      regression: {
        es: 'siéntate y levántate de una silla, o baja solo hasta la mitad',
        en: 'sit and stand up from a chair, or just go halfway down',
      },
      sets: 2, reps: '15',
    },
    {
      id: 'pushup_std',
      name: { es: 'Flexión', en: 'Push-up' },
      muscles: { es: 'Pecho, hombros, tríceps', en: 'Chest, shoulders, triceps' },
      note: {
        es: 'Cuerpo rígido como una tabla. Baja el pecho hasta rozar el suelo, codos a 45°.',
        en: 'Body rigid like a plank. Lower your chest until it grazes the floor, elbows at 45°.',
      },
      regression: { es: 'flexión con las rodillas apoyadas', en: 'knee push-up' },
      regressionId: 'knee_push_up',
      sets: 2, reps: '10',
    },
    {
      id: 'plank',
      name: { es: 'Plancha', en: 'Plank' },
      muscles: { es: 'Core', en: 'Core' },
      note: {
        es: 'Cuerpo en línea recta de la cabeza a los talones. Aprieta el abdomen, no dejes caer las caderas.',
        en: 'Body in a straight line from head to heels. Brace your core, don’t let your hips drop.',
      },
      regression: {
        es: 'plancha apoyando las rodillas en el suelo',
        en: 'plank with your knees on the floor',
      },
      sets: 2, reps: '30s', isTimer: true, timerSeconds: 30,
    },
  ],
  avanzado: [
    {
      id: 'jump_squat',
      name: { es: 'Sentadilla con salto', en: 'Jump squat' },
      muscles: { es: 'Piernas, glúteos', en: 'Legs, glutes' },
      note: {
        es: 'Baja en sentadilla y salta explosivo. Aterriza suave con las rodillas dobladas. Solo si no hay dolor.',
        en: 'Squat down and jump explosively. Land softly with your knees bent. Only if there’s no pain.',
      },
      regression: { es: 'sentadilla sin salto', en: 'bodyweight squat, no jump' },
      regressionId: 'bodyweight_squat',
      sets: 2, reps: '10',
    },
    {
      id: 'diamond_pushup',
      name: { es: 'Flexión diamante', en: 'Diamond push-up' },
      muscles: { es: 'Tríceps, pecho', en: 'Triceps, chest' },
      note: {
        es: 'Manos juntas en diamante bajo el pecho. Codos pegados al cuerpo al bajar.',
        en: 'Hands together in a diamond under your chest. Elbows close to your body as you lower.',
      },
      regression: { es: 'flexión estándar', en: 'standard push-up' },
      regressionId: 'pushup_std',
      sets: 2, reps: '10',
    },
    {
      id: 'hollow_hold',
      name: { es: 'Hollow hold', en: 'Hollow hold' },
      muscles: { es: 'Core', en: 'Core' },
      note: {
        es: 'Lumbar pegada al suelo. Brazos y piernas lo más extendidos posible sin que la espalda se despegue.',
        en: 'Lower back pressed to the floor. Arms and legs extended as far as possible without your back lifting.',
      },
      regression: {
        es: 'dead bug: alterna brazo y pierna contraria, despacio',
        en: 'dead bug: alternate opposite arm and leg, slow',
      },
      regressionId: 'dead_bug',
      sets: 2, reps: '25s', isTimer: true, timerSeconds: 25,
    },
  ],
}

/**
 * Ids del catálogo que usa el primer entreno, ejercicio principal + regresión
 * (para el test de integridad: existen y ninguno pide material).
 */
export const FIRST_WORKOUT_EXERCISE_IDS: readonly string[] = Array.from(
  new Set(
    Object.values(FIRST_WORKOUTS)
      .flat()
      .flatMap(e => (e.regressionId ? [e.id, e.regressionId] : [e.id])),
  ),
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
 * temporizador) más los descansos. Es la promesa del CTA («· 5 MIN»), así que
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
 * Frase de regresión: siempre el texto curado de `entry.regression`, nunca
 * el nombre pelado del catálogo. Antes, con `regressionId` y catálogo
 * cargado, ganaba `index.byId.get(id).name` — un nombre propio («Dead Bug»,
 * «Push-up Rodillas») sin ninguna instrucción de cómo hacer la variante, al
 * contrario que el texto curado («dead bug: alterna brazo y pierna
 * contraria, despacio»). El catálogo está cargado en la práctica SIEMPRE que
 * `buildFirstWorkout` corre en producción (móvil primea el índice al
 * arrancar, `apps/mobile/src/lib/init-core.ts`; web espera
 * `loadCatalogIndex()` antes de llamar, `apps/web/src/pages/ActiveSessionPage.tsx`),
 * así que el nombre pelado dejaba el texto curado como código muerto en 4 de
 * los 9 ejercicios (pushup_std, jump_squat, diamond_pushup, hollow_hold —
 * hallazgo de revisión, #812 ronda 2). `regressionId` sigue existiendo para
 * validar en `FIRST_WORKOUT_EXERCISE_IDS` que la variante existe en el
 * catálogo y no pide material; ya no decide qué texto se muestra.
 */
function regressionPhrase(entry: FirstWorkoutEntry, locale: string): string {
  return localize(entry.regression, locale)
}

/**
 * Pega la frase de regresión a la nota de técnica con un prefijo localizado.
 * El prefijo no es una simple `TranslatableField` con dos puntos fijos: en
 * español «Si no te sale: …» lee bien con dos puntos, pero en inglés «Too
 * hard? Try: …» suena a machine translation — «Too hard? Try …» sin los dos
 * puntos es lo natural.
 */
function withRegression(technique: string, regression: string, locale: string): string {
  const suffix = locale === 'en'
    ? `Too hard? Try ${regression}.`
    : `Si no te sale: ${regression}.`
  return `${technique} ${suffix}`
}

/**
 * Construye el `Workout` del primer entreno para un nivel e idioma.
 *
 * Con el índice del catálogo cargado toma nombre y músculos de allí (es lo que
 * pinta el resto de la app); si no, de los fallbacks embebidos.
 *
 * La NOTA es la excepción: siempre es la curada de `entry.note`, nunca la del
 * catálogo (`cat?.note`). La issue proponía `cat?.note ?? entry.note`, pero
 * en el catálogo `bodyweight_squat` y `knee_push_up` traen
 * `note: { es: '', en: '' }` — un objeto no nulo, así que `??` habría
 * devuelto una nota vacía en el primer ejercicio de cada nivel principiante
 * y en el segundo de intermedio. Y aunque el catálogo tuviera texto (como
 * `plank`), está escrito en general, no para alguien que hace el ejercicio
 * por primera vez en el día 0.
 */
export function buildFirstWorkout(level: string | null | undefined, locale: string): Workout {
  const lv = normalizeFirstWorkoutLevel(level)
  const index = getCatalogIndexSync()
  const exercises: Exercise[] = FIRST_WORKOUTS[lv].map(entry => {
    const cat = index?.byId.get(entry.id)
    const technique = localize(entry.note, locale)
    const regression = regressionPhrase(entry, locale)
    return {
      id: entry.id,
      name: localize(cat?.name ?? entry.name, locale),
      sets: entry.sets,
      reps: entry.reps,
      rest: REST_SECONDS,
      muscles: localize(cat?.muscles ?? entry.muscles, locale),
      note: withRegression(technique, regression, locale),
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
