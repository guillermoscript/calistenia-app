import type { Exercise } from '@calistenia/core/types'
import { localize } from '@calistenia/core/lib/i18n-db'
import type { CatalogExercise } from '@/lib/catalog'

export function catalogToExercise(c: CatalogExercise, locale: string): Exercise {
  return {
    id: c.id,
    name: localize(c.name, locale),
    sets: c.sets,
    reps: c.reps,
    rest: c.rest,
    muscles: localize(c.muscles, locale),
    note: localize(c.note, locale),
    youtube: c.youtube_search || c.youtube_query || '',
    priority: c.priority,
    isTimer: c.isTimer,
    timerSeconds: c.timerSeconds,
    equipment: c.equipment,
    difficulty: c.difficulty as Exercise['difficulty'],
  }
}
