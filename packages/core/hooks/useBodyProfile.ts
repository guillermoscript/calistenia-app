import { useQuery } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'
import type { Sex } from '../types'

export interface BodyProfile {
  sex?: Sex
  heightCm?: number
  weightKg?: number
}

/**
 * Sexo + altura + peso actuales del usuario, para cálculos de composición
 * corporal (#227: % grasa método Navy necesita sexo y altura; peso para masa
 * magra). Altura y peso viven en `users`; el sexo es PII oculto en `users`
 * (fix #247) así que la fuente fiable es la fila de `nutrition_goals` — puede
 * no existir todavía (perfil incompleto) y entonces `sex` queda undefined.
 */
export function useBodyProfile(userId: string | null): { profile: BodyProfile; isReady: boolean } {
  const query = useQuery({
    queryKey: qk.bodyProfile(userId),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<BodyProfile> => {
      const profile: BodyProfile = {}
      try {
        const user: any = await pb.collection('users').getOne(userId!, { fields: 'height,weight' })
        profile.heightCm = Number(user.height) || undefined
        profile.weightKg = Number(user.weight) || undefined
      } catch { /* degrada a undefined */ }
      try {
        const goals: any = await pb.collection('nutrition_goals').getFirstListItem(
          pb.filter('user = {:uid}', { uid: userId! }),
        )
        profile.sex = (goals.sex as Sex) || undefined
      } catch { /* sin fila de goals: sexo desconocido */ }
      return profile
    },
  })

  return { profile: query.data ?? {}, isReady: !userId || query.isFetched }
}
