import { useEffect, useState } from 'react'
import { getFrequentMeals } from '../lib/nutrition-frequent'
import type { NutritionEntry } from '../types'

interface UseFrequentMealsDeps {
  /** Carga solo cuando la pantalla está lista (goals + entries cargados). */
  enabled: boolean
  /** `useNutrition().getRecentEntries` — identidad estable. */
  getRecentEntries: (limit?: number) => Promise<NutritionEntry[]>
  /** Cuántas entries recientes mirar (por defecto 20). */
  sample?: number
}

/**
 * Comidas frecuentes para el quick-tap (#470). Deriva con `getFrequentMeals`
 * sobre las últimas `sample` entries. Alive-guarded: no hace setState tras
 * desmontar. Errores de red dejan la lista vacía (la fila simplemente no se
 * pinta).
 */
export function useFrequentMeals({ enabled, getRecentEntries, sample = 20 }: UseFrequentMealsDeps) {
  const [frequentMeals, setFrequentMeals] = useState<NutritionEntry[]>([])

  useEffect(() => {
    if (!enabled) return
    let alive = true
    getRecentEntries(sample)
      .then(recent => { if (alive) setFrequentMeals(getFrequentMeals(recent)) })
      .catch(() => { if (alive) setFrequentMeals([]) })
    return () => { alive = false }
  }, [enabled, getRecentEntries, sample])

  return frequentMeals
}
