/**
 * exerciseCatalog — pieza única para «qué es un ejercicio del catálogo».
 *
 * Este fichero arranca con el mapper COPIADO LITERALMENTE de
 * `apps/web/src/pages/ExerciseDetailPage.tsx:210-228` (la versión en producción),
 * para que el test que lo acompaña demuestre en rojo la pérdida de
 * `difficulty_level` antes de arreglarla (#474).
 */

import type { DifficultyLevel, Priority } from '../types'
import type { TranslatableField } from './i18n-db'

export interface CatalogExercise {
  id: string
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

export function mapCatalogRecord(rec: any): CatalogExercise {
  return {
    id: rec.id,
    slug: rec.slug || rec.id,
    name: rec.name ?? '',
    muscles: rec.muscles ?? '',
    category: rec.category || 'full',
    priority: rec.priority || 'med',
    sets: rec.default_sets ?? 3,
    reps: rec.default_reps || '8-12',
    rest: rec.default_rest ?? 90,
    note: rec.note ?? '',
    youtube: rec.youtube || '',
    isTimer: rec.is_timer || false,
    timerSeconds: rec.timer_seconds,
    demoImages: rec.default_images ? (Array.isArray(rec.default_images) ? rec.default_images : [rec.default_images]) : undefined,
    demoVideo: rec.demo_video,
    description: rec.description || rec.note || '',
  }
}
