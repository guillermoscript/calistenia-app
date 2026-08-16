import { useEffect, useState } from 'react'
import { fetchNutritionProfilePrefill, type NutritionProfilePrefill } from '../lib/nutrition-profile'

/**
 * Prefill del wizard de objetivos desde `users` (#470). Alive-guarded; sin
 * usuario devuelve `{}`.
 */
export function useNutritionProfilePrefill(userId: string | null): NutritionProfilePrefill {
  const [profile, setProfile] = useState<NutritionProfilePrefill>({})

  useEffect(() => {
    if (!userId) return
    let alive = true
    fetchNutritionProfilePrefill(userId).then(p => { if (alive) setProfile(p) })
    return () => { alive = false }
  }, [userId])

  return profile
}
