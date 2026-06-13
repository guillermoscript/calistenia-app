/** Búsqueda en el catálogo por nombre localizado (picker manual + preview IA). */
import { useMemo } from 'react'
import { CATALOG, type CatalogExercise } from '@/lib/catalog'
import { localize } from '@calistenia/core/lib/i18n-db'

export interface ExerciseSearchOptions {
  query: string
  locale: string
  /** Filtra por categoría exacta; omitir para no filtrar. */
  category?: string
  /** IDs a excluir del resultado (p. ej. ya seleccionados). */
  excludeIds?: string[]
  /** Largo mínimo de query para devolver resultados (default 0). */
  minLength?: number
  /** Máximo de resultados (default sin límite). */
  limit?: number
}

export function useExerciseSearch({
  query,
  locale,
  category,
  excludeIds,
  minLength = 0,
  limit,
}: ExerciseSearchOptions): CatalogExercise[] {
  return useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < minLength) return []
    const exclude = excludeIds ? new Set(excludeIds) : null

    const results = CATALOG.filter((ex) => {
      if (exclude?.has(ex.id)) return false
      if (category && ex.category !== category) return false
      return q === '' || localize(ex.name, locale).toLowerCase().includes(q)
    })

    return limit != null ? results.slice(0, limit) : results
  }, [query, locale, category, excludeIds, minLength, limit])
}
