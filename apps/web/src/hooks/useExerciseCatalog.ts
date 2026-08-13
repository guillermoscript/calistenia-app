import { useEffect, useState } from 'react'
import { WORKOUTS } from '@calistenia/core/data/workouts'
import { pb, isPocketBaseAvailable } from '@calistenia/core/lib/pocketbase'
import type { TranslatableField } from '@calistenia/core/lib/i18n-db'

export type ExerciseCatalog = Record<string, { name: TranslatableField; muscles: TranslatableField }>

function buildStaticCatalog(): ExerciseCatalog {
  const catalog: ExerciseCatalog = {}
  Object.values(WORKOUTS).forEach(workout => {
    workout.exercises.forEach(ex => {
      if (!catalog[ex.id]) {
        catalog[ex.id] = { name: ex.name, muscles: ex.muscles }
      }
    })
  })
  return catalog
}

export const STATIC_CATALOG = buildStaticCatalog()

/**
 * Catálogo de ejercicios para las vistas de detalle: los estáticos de WORKOUTS
 * más los de `exercises_catalog` en PB (necesarios para sesiones libres).
 * Cae al estático si PB no está disponible.
 */
export function useExerciseCatalog(): ExerciseCatalog {
  const [catalog, setCatalog] = useState<ExerciseCatalog>(STATIC_CATALOG)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        if (!(await isPocketBaseAvailable())) return
        const res = await pb.collection('exercises_catalog').getList(1, 200, { $autoCancel: false })
        if (cancelled) return
        const merged: ExerciseCatalog = { ...STATIC_CATALOG }
        res.items.forEach((item: any) => {
          if (!merged[item.id]) {
            merged[item.id] = { name: item.name ?? '', muscles: item.muscles ?? '' }
          }
        })
        setCatalog(merged)
      } catch { /* static catalog fallback */ }
    }
    load()
    return () => { cancelled = true }
  }, [])

  return catalog
}
