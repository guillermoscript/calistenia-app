/**
 * Mappings from wger exercise data → app exercise catalog format (MCP server version).
 */

import type { WgerExerciseInfo } from './wger.js'

// ── Language codes ──────────────────────────────────────────────────────────

const WGER_LANGUAGE_IDS: Record<string, number> = {
  es: 4,
  en: 2,
  de: 1,
}

// ── Equipment mapping ───────────────────────────────────────────────────────

const EQUIPMENT_MAP: Record<number, string> = {
  1: 'lastre',
  3: 'lastre',
  4: 'ninguno',
  5: 'fitball',
  6: 'barra_dominadas',
  7: 'ninguno',
  8: 'banco',
  9: 'banco',
  10: 'kettlebell',
}

// ── Muscle mapping ──────────────────────────────────────────────────────────

const MUSCLE_MAP: Record<number, string> = {
  1: 'Bíceps',
  2: 'Deltoides',
  3: 'Pecho',
  4: 'Trapecio',
  5: 'Pecho',
  6: 'Core',
  7: 'Pantorrillas',
  8: 'Glúteos',
  9: 'Dorsal',
  10: 'Dorsal',
  11: 'Bíceps',
  12: 'Core',
  13: 'Pantorrillas',
  14: 'Cuádriceps',
  15: 'Isquios',
}

// ── Category mapping ────────────────────────────────────────────────────────

type AppCategoryId = 'push' | 'pull' | 'legs' | 'core' | 'full'

const CATEGORY_MAP: Record<number, AppCategoryId> = {
  8: 'push',
  9: 'legs',
  10: 'core',
  11: 'push',
  12: 'pull',
  13: 'push',
  14: 'legs',
  15: 'full',
}

const PULL_MUSCLE_IDS = new Set([1, 9, 10, 11])

function mapCategory(info: WgerExerciseInfo): AppCategoryId {
  const base = CATEGORY_MAP[info.category.id] ?? 'full'
  if (info.category.id === 8) {
    const allMuscleIds = [...info.muscles, ...info.muscles_secondary].map(m => m.id)
    return allMuscleIds.some(id => PULL_MUSCLE_IDS.has(id)) ? 'pull' : 'push'
  }
  return base
}

// ── Main mapping ────────────────────────────────────────────────────────────

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
  /** i18n name object for PocketBase storage */
  name_i18n: Record<string, string>
  /** i18n description object for PocketBase storage */
  description_i18n: Record<string, string>
  /** i18n muscles object for PocketBase storage */
  muscles_i18n: Record<string, string>
}

export function mapWgerToExerciseCatalog(
  info: WgerExerciseInfo,
  language = 'es'
): MappedExercise {
  const langId = WGER_LANGUAGE_IDS[language] ?? WGER_LANGUAGE_IDS.es
  const enLangId = WGER_LANGUAGE_IDS.en

  let name = info.name
  let description = info.description || ''

  const targetTranslation = info.translations?.find(t => t.language === langId)
  const enTranslation = info.translations?.find(t => t.language === enLangId)

  if (targetTranslation?.name) {
    name = targetTranslation.name
    description = targetTranslation.description || description
  } else if (enTranslation?.name) {
    name = enTranslation.name
    description = enTranslation.description || description
  }

  description = description.replace(/<[^>]*>/g, '').trim()

  const allMuscles = [...info.muscles, ...info.muscles_secondary]
  const muscleNames = [...new Set(allMuscles.map(m => MUSCLE_MAP[m.id] ?? m.name))]

  const equipmentIds = info.equipment.length > 0
    ? [...new Set(info.equipment.map(e => EQUIPMENT_MAP[e.id] ?? 'ninguno'))]
    : ['ninguno']

  const slug = name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  // Build i18n objects from available translations
  const nameI18n: Record<string, string> = { [language]: name }
  const descI18n: Record<string, string> = { [language]: description }

  // Add English translation if available and different from target language
  if (language !== 'en' && enTranslation?.name) {
    nameI18n.en = enTranslation.name
    descI18n.en = (enTranslation.description || '').replace(/<[^>]*>/g, '').trim()
  }
  // Add Spanish translation if available and different from target language
  if (language !== 'es' && targetTranslation?.name) {
    // targetTranslation is already the requested language; try to find Spanish
    const esTranslation = info.translations?.find(t => t.language === WGER_LANGUAGE_IDS.es)
    if (esTranslation?.name) {
      nameI18n.es = esTranslation.name
      descI18n.es = (esTranslation.description || '').replace(/<[^>]*>/g, '').trim()
    }
  }

  const musclesStr = muscleNames.join(', ')

  return {
    name,
    slug,
    description,
    muscles: musclesStr,
    category: mapCategory(info),
    equipment: equipmentIds,
    priority: 'med',
    default_sets: 3,
    default_reps: '8-12',
    default_rest_seconds: 60,
    source: 'wger',
    wger_id: info.id,
    wger_language: language,
    name_i18n: nameI18n,
    description_i18n: descI18n,
    muscles_i18n: { [language]: musclesStr },
  }
}
