/**
 * Mappings from wger exercise data → app exercise catalog format.
 */

import type { WgerExerciseInfo } from './wger'

// ── Language codes (wger uses numeric IDs) ──────────────────────────────────

const WGER_LANGUAGE_IDS: Record<string, number> = {
  es: 4,
  en: 2,
  de: 1,
}

// ── Equipment mapping (wger ID → app equipment ID) ─────────────────────────

const EQUIPMENT_MAP: Record<number, string> = {
  1: 'lastre',           // Barbell
  3: 'lastre',           // Dumbbell
  4: 'ninguno',          // Gym mat
  5: 'fitball',          // Swiss Ball
  6: 'barra_dominadas',  // Pull-up bar
  7: 'ninguno',          // none (bodyweight)
  8: 'banco',            // Bench
  9: 'banco',            // Incline bench
  10: 'kettlebell',      // Kettlebell
}

// ── Muscle mapping (wger muscle ID → app muscle name in Spanish) ────────────

const MUSCLE_MAP: Record<number, string> = {
  1: 'Bíceps',
  2: 'Deltoides',
  3: 'Pecho',
  4: 'Trapecio',
  5: 'Pecho',           // Serratus anterior → Pecho
  6: 'Core',            // Rectus abdominis
  7: 'Pantorrillas',    // Gastrocnemius
  8: 'Glúteos',
  9: 'Dorsal',          // Trapezius (mid/low)
  10: 'Dorsal',         // Latissimus dorsi
  11: 'Bíceps',         // Brachialis
  12: 'Core',           // Obliquus ext.
  13: 'Pantorrillas',   // Soleus
  14: 'Cuádriceps',
  15: 'Isquios',        // Hamstrings
}

// ── Category mapping (wger category ID → app CategoryId) ────────────────────

type AppCategoryId = 'push' | 'pull' | 'legs' | 'core' | 'full'

const CATEGORY_MAP: Record<number, AppCategoryId> = {
  8: 'push',   // Arms — will refine below based on muscles
  9: 'legs',   // Legs
  10: 'core',  // Abs
  11: 'push',  // Chest
  12: 'pull',  // Back
  13: 'push',  // Shoulders
  14: 'legs',  // Calves
  15: 'full',  // Cardio
}

// Muscles that indicate "pull" when category is Arms (8)
const PULL_MUSCLE_IDS = new Set([1, 9, 10, 11]) // Biceps, Trapezius, Lats, Brachialis

function mapCategory(info: WgerExerciseInfo): AppCategoryId {
  const base = CATEGORY_MAP[info.category.id] ?? 'full'

  // Refine "Arms" category based on muscles
  if (info.category.id === 8) {
    const allMuscleIds = [...info.muscles, ...info.muscles_secondary].map(m => m.id)
    const hasPullMuscle = allMuscleIds.some(id => PULL_MUSCLE_IDS.has(id))
    return hasPullMuscle ? 'pull' : 'push'
  }

  return base
}

// ── Main mapping function ───────────────────────────────────────────────────

export interface MappedExercise {
  name: string
  slug: string
  description: string
  muscles: string
  category: string
  equipment: string[]
  priority: 'med'
  default_sets: number
  default_reps: string
  default_rest_seconds: number
  source: 'wger'
  wger_id: number
  wger_language: string
}

export function mapWgerToExerciseCatalog(
  info: WgerExerciseInfo,
  language = 'es'
): MappedExercise {
  // Find translated name/description
  const langId = WGER_LANGUAGE_IDS[language] ?? WGER_LANGUAGE_IDS.es
  const enLangId = WGER_LANGUAGE_IDS.en

  let name = info.name
  let description = info.description || ''

  // Try target language first, then English, then default
  const targetTranslation = info.translations?.find(t => t.language === langId)
  const enTranslation = info.translations?.find(t => t.language === enLangId)

  if (targetTranslation?.name) {
    name = targetTranslation.name
    description = targetTranslation.description || description
  } else if (enTranslation?.name) {
    name = enTranslation.name
    description = enTranslation.description || description
  }

  // Strip HTML tags from description
  description = description.replace(/<[^>]*>/g, '').trim()

  // Map muscles
  const allMuscles = [...info.muscles, ...info.muscles_secondary]
  const muscleNames = [...new Set(allMuscles.map(m => MUSCLE_MAP[m.id] ?? m.name))]

  // Map equipment
  const equipmentIds = info.equipment.length > 0
    ? [...new Set(info.equipment.map(e => EQUIPMENT_MAP[e.id] ?? 'ninguno'))]
    : ['ninguno']

  // Generate slug
  const slug = name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  return {
    name,
    slug,
    description,
    muscles: muscleNames.join(', '),
    category: mapCategory(info),
    equipment: equipmentIds,
    priority: 'med',
    default_sets: 3,
    default_reps: '8-12',
    default_rest_seconds: 60,
    source: 'wger',
    wger_id: info.id,
    wger_language: language,
  }
}
