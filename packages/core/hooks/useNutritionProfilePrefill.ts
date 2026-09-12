import { useEffect, useState } from 'react'
import { fetchNutritionProfilePrefill, type NutritionProfilePrefill } from '../lib/nutrition-profile'

export interface NutritionProfilePrefillState {
  profile: NutritionProfilePrefill
  /**
   * `false` hasta que la lectura del perfil termina (con datos, vacía o
   * fallida). `NutritionGoalSetup` congela sus props en `useState`, así que
   * montarlo antes de esto lo deja vacío para siempre: hay que esperar.
   */
  loaded: boolean
}

/**
 * Prefill del wizard de objetivos desde `users` (#470). Alive-guarded; sin
 * usuario devuelve `{}` ya cargado.
 */
export function useNutritionProfilePrefill(userId: string | null): NutritionProfilePrefillState {
  const [state, setState] = useState<NutritionProfilePrefillState>({ profile: {}, loaded: false })

  useEffect(() => {
    if (!userId) { setState({ profile: {}, loaded: true }); return }
    let alive = true
    setState({ profile: {}, loaded: false })
    fetchNutritionProfilePrefill(userId)
      .then(p => { if (alive) setState({ profile: p, loaded: true }) })
      // `fetchNutritionProfilePrefill` ya se traga sus errores, pero si alguna
      // vez dejara de hacerlo, quedarse en `loaded: false` congelaría la
      // pantalla en el skeleton.
      .catch(() => { if (alive) setState({ profile: {}, loaded: true }) })
    return () => { alive = false }
  }, [userId])

  return state
}
