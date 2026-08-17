/**
 * exerciseCatalog — pieza única para «qué es un ejercicio del catálogo» (#474).
 *
 * Antes de este fichero cada página de la web se escribía su propia copia y las
 * copias divergieron:
 *
 *  - `inferCategory()` ×3 con dos firmas y tres juegos de reglas
 *    (`ExerciseDetailPage`, `ExerciseLibraryPage`, `ExerciseCatalogPicker`), así que
 *    el mismo ejercicio caía en categorías distintas según desde dónde se mirase.
 *  - `mapPBRecord()` ×2 con la precedencia `note`/`description` invertida, y el de
 *    la página de detalle **perdía `difficulty_level`** por no declararlo siquiera
 *    en su tipo.
 *  - La identidad del ejercicio, en 6 sitios y con 4 estrategias distintas
 *    (`rec.id`, `rec.slug || rec.id`, `rec.exercise_id || rec.id`, id local).
 *
 * Las tres cosas viven aquí ahora. Sin dependencias de DOM ni de React: son
 * funciones puras y se testean como tales.
 */

import type { DifficultyLevel, ExerciseLog, Priority } from '../types'
import type { TranslatableField } from './i18n-db'
import { normalizeForLookup, resolveExerciseId } from './resolveExerciseId'

// ── Forma del ejercicio de catálogo ──────────────────────────────────────────

/**
 * Superconjunto de lo que necesitaban las copias. Es a propósito: cuando cada
 * página declaraba su propio tipo, omitir un campo era la forma de perderlo
 * (así se perdía `difficulty`). Un consumidor puede ignorar campos; ya no puede
 * hacer que el mapper deje de mapearlos.
 */
export interface CatalogExercise {
  /** Clave primaria del registro de PocketBase (o el id local si no viene de PB). */
  id: string
  /** Identidad canónica y estable — la que debe viajar a `sets_log`. */
  slug: string
  name: TranslatableField
  muscles: TranslatableField
  category: string
  priority: Priority
  sets: number | string
  reps: string
  rest: number
  note: TranslatableField
  youtube: string
  isTimer?: boolean
  timerSeconds?: number
  demoImages?: string[]
  demoVideo?: string
  description?: TranslatableField
  difficulty?: DifficultyLevel
  equipment?: string[]
  muscle_groups?: string[]
}

// ── Categorías ───────────────────────────────────────────────────────────────

/**
 * Vocabulario canónico: el que ya emitían `ExerciseDetailPage` y
 * `ExerciseLibraryPage`, y para el que `ExerciseLibraryPage` ya tiene aliases
 * hacia los ids de sus botones (`mobility`/`movilidad`, `skills`/`skill`,
 * `glutes_lower_back`/`lumbar`). No se toca aquí para no mover ese filtrado.
 */
export const CATALOG_CATEGORIES = [
  'push', 'pull', 'legs', 'core', 'lumbar', 'full', 'movilidad', 'skill', 'yoga',
] as const

export interface CategoryInput {
  name?: TranslatableField | null
  muscles?: TranslatableField | null
  note?: TranslatableField | null
}

/**
 * Aplana un campo traducible a un texto normalizado (sin acentos, minúsculas)
 * para buscar palabras clave.
 *
 * Junta **todos** los idiomas del campo, no sólo uno. Las tres copias mezclaban
 * criterios —dos buscaban palabras inglesas tras `localize(field, 'en')`, la del
 * picker buscaba nombres de músculo en español sobre el string crudo— y eso sólo
 * funcionaba porque `localize()` devuelve tal cual los strings planos de
 * `WORKOUTS`, que están en español. Con los campos `{es, en}` del catálogo de PB
 * la mitad de las reglas se quedaba ciega. Buscando sobre todos los idiomas a la
 * vez, cada regla ve el idioma en el que fue escrita.
 */
function haystack(field?: TranslatableField | null): string {
  if (!field) return ''
  if (typeof field === 'string') return normalizeForLookup(field)
  return normalizeForLookup(Object.values(field).join(' '))
}

const includesAny = (text: string, needles: string[]): boolean =>
  needles.some(n => text.includes(n))

// Palabras clave normalizadas (sin acentos): 'triceps' casa 'tríceps'.
const SKILL_NAMES = ['handstand', 'l-sit', 'muscle-up', 'muscle up', 'front lever', 'back lever', 'planche', 'human flag', 'hspu', 'skill']
const YOGA_NAMES = ['yoga', 'asana', 'surya', 'namaskar', 'pranayama', 'savasana', 'padma']
const MOBILITY_NAMES = ['stretch', 'mobility', 'movilidad', 'cat-cow', 'pigeon', 'child', 'forward fold', 'hip flexor', 'thoracic', 'cossack', 'jefferson', 'world', '90/90', 'pose', 'fold', 'rotation']
const CORE_MUSCLES = ['core', 'oblicuo', 'abdominal']
const CORE_NAMES = ['hollow', 'plank', 'dead bug', 'side plank']
const LUMBAR_MUSCLES = ['lumbar', 'columna']
const LUMBAR_NAMES = ['lumbar', 'bird-dog', 'superman', 'glute bridge']
const PUSH_MUSCLES = ['pecho', 'triceps', 'hombro', 'deltoid']
const PUSH_NAMES = ['push-up', 'push up', 'push', 'dip', 'pike']
const PULL_MUSCLES = ['dorsal', 'biceps', 'romboid']
const PULL_NAMES = ['pull-up', 'pull up', 'pull', 'chin-up', 'chin', 'row', 'face pull', 'retraccion', 'australian', 'renegade', 'inverted']
const LEGS_MUSCLES = ['cuadriceps', 'gluteo', 'isquio', 'pantorrilla']
const LEGS_NAMES = ['squat', 'lunge', 'bulgarian', 'pistol', 'nordic', 'step-up', 'calf', 'wall sit', 'jump squat', 'box jump', 'shrimp', 'good morning']

/**
 * Clasifica un ejercicio en una de `CATALOG_CATEGORIES`.
 *
 * Es la unión de las tres copias, conservando el orden de las dos que coincidían
 * (skill → movilidad → core → lumbar → push → pull → legs → full) e insertando
 * las reglas que sólo tenía el picker: nombres de músculo en español y la
 * detección de `yoga`.
 *
 * `yoga` se comprueba **antes** que `movilidad`, al contrario que en
 * `ExerciseLibraryPage`, donde un nombre con «yoga» caía en `movilidad`. Es un
 * cambio deliberado: esa página tiene un botón «Yoga» que hoy no puede casar
 * nada, porque su `inferCategory` nunca devolvía esa categoría.
 *
 * @param dayType categoría del día del programa, usada como último recurso
 *   (y para forzar `lumbar`/`legs`/`full` como hacían las copias originales).
 */
export function inferCategory(exercise: CategoryInput, dayType: string = ''): string {
  const name = haystack(exercise.name)
  const muscles = haystack(exercise.muscles)
  const note = haystack(exercise.note)

  if (includesAny(name, SKILL_NAMES)) return 'skill'
  if (includesAny(name, YOGA_NAMES)) return 'yoga'
  if (includesAny(name, MOBILITY_NAMES)) return 'movilidad'
  if (includesAny(muscles, CORE_MUSCLES) || includesAny(name, CORE_NAMES)) return 'core'
  if (dayType === 'lumbar' || includesAny(muscles, LUMBAR_MUSCLES) ||
      includesAny(name, LUMBAR_NAMES) || note.includes('lumbar')) return 'lumbar'
  if (includesAny(muscles, PUSH_MUSCLES) || includesAny(name, PUSH_NAMES)) return 'push'
  if (includesAny(muscles, PULL_MUSCLES) || includesAny(name, PULL_NAMES)) return 'pull'
  if (includesAny(muscles, LEGS_MUSCLES) || includesAny(name, LEGS_NAMES) || dayType === 'legs') return 'legs'
  if (name.includes('burpee') || muscles.includes('full') || name.includes('full') || dayType === 'full') return 'full'

  return dayType || 'full'
}

// ── Mapeo de registros de PocketBase ─────────────────────────────────────────

/**
 * Mapea un registro de `exercises_catalog` a `CatalogExercise`.
 *
 * Diferencias respecto a las dos copias que sustituye:
 *  - **`difficulty_level` se mapea** (lo perdía `ExerciseDetailPage`).
 *  - `note` y `description` se prefieren a sí mismos y caen el uno en el otro,
 *    en vez de tener la precedencia invertida entre páginas. Antes
 *    `note: rec.note ?? ''` hacía que un `note` vacío ganase sobre `description`.
 *  - `category` cae en `inferCategory()` en vez de en `'full'` a secas.
 *  - `equipment`/`muscle_groups` se mapean sólo si traen datos: un array vacío
 *    haría que `getExerciseEquipment()` diese el campo por bueno y se saltase su
 *    detección por palabras clave.
 */
export function mapCatalogRecord(rec: any): CatalogExercise {
  const note = rec.note || rec.description || ''
  const description = rec.description || rec.note || ''

  return {
    id: rec.id,
    slug: catalogExerciseIdentity(rec),
    name: rec.name ?? '',
    muscles: rec.muscles ?? '',
    category: rec.category || inferCategory(rec),
    priority: rec.priority || 'med',
    sets: rec.default_sets ?? 3,
    reps: rec.default_reps || '8-12',
    rest: rec.default_rest ?? 90,
    note,
    youtube: rec.youtube || '',
    isTimer: rec.is_timer || false,
    timerSeconds: rec.timer_seconds,
    demoImages: rec.default_images
      ? (Array.isArray(rec.default_images) ? rec.default_images : [rec.default_images])
      : undefined,
    demoVideo: rec.demo_video,
    description,
    difficulty: rec.difficulty_level || undefined,
    equipment: Array.isArray(rec.equipment) && rec.equipment.length ? rec.equipment : undefined,
    muscle_groups: Array.isArray(rec.muscle_groups) && rec.muscle_groups.length ? rec.muscle_groups : undefined,
  }
}

// ── Identidad ────────────────────────────────────────────────────────────────

/**
 * Identidad canónica de un ejercicio del catálogo: **slug primero**.
 *
 * El `id` de PocketBase es aleatorio y por registro, así que usarlo para
 * registrar series fragmenta el historial en silencio (lo documentaba
 * `LogWorkoutPage`, que era el único sitio que lo hacía bien). `slug` es
 * obligatorio en `exercises_catalog` desde la migración `1774000001`.
 *
 * Nótese que **no** se consulta `rec.exercise_id`: ese campo no existe en la
 * colección (no aparece en ninguna migración), así que el
 * `r.exercise_id || r.id` de `CircuitBuilder` y `ExerciseCatalogPicker` caía
 * siempre al id aleatorio.
 *
 * El resultado pasa por `resolveExerciseId()`, que mapea variantes de escritura
 * al id canónico del catálogo empaquetado y, si no encuentra nada seguro,
 * devuelve la entrada intacta sin inventarse coincidencias.
 */
export function catalogExerciseIdentity(rec: { slug?: string; id?: string }): string {
  const raw = rec.slug || rec.id || ''
  return raw ? resolveExerciseId(raw) : ''
}

// ── Series registradas ───────────────────────────────────────────────────────

/**
 * Series ya guardadas para un ejercicio en un workout y un día concretos.
 *
 * `ExerciseCard` llevaba `setsLogged` en estado local arrancando en 0, así que
 * al remontar la tarjeta las series ya guardadas volvían a mostrarse como 0/N.
 * Derivarlas de `logs` es lo que arregla eso.
 */
export function countSetsLoggedFor(
  logs: ExerciseLog[] | undefined,
  workoutKey: string,
  date: string,
): number {
  if (!logs?.length) return 0
  return logs
    .filter(log => log.date === date && log.workoutKey === workoutKey)
    .reduce((total, log) => total + (log.sets?.length ?? 0), 0)
}
