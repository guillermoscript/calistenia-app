import { useCallback } from 'react'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { nowLocalForPB } from '../lib/dateUtils'
import { qk } from '../lib/query-keys'
import type { FoodItem, MealType } from '../types'

/**
 * Historial de alimentos. Las dos consultas de lectura (recent / hour) se
 * sirven desde el caché de TanStack Query mediante fetchQuery, que reutiliza
 * datos frescos sin ir a la red. trackFood es una mutación que invalida ambas
 * keys al completar. Forma pública estable: { getRecentFoods, getHourSuggestions, trackFood }.
 */
export function useFoodHistory(userId: string | null) {
  const qc = useQueryClient()

  // — Consulta: alimentos recientes —
  const getRecentFoods = useCallback(
    async (limit = 8): Promise<FoodItem[]> => {
      if (!userId) return []
      return qc.fetchQuery({
        queryKey: qk.foodHistory.recent(userId, limit),
        staleTime: 60_000, // 1 min; evita viajes redundantes en ráfaga
        queryFn: async () => {
          try {
            const res = await pb.collection('food_history').getList(1, limit, {
              filter: pb.filter('user = {:uid}', { uid: userId }),
              sort: '-last_used_at',
            })
            return res.items.map((r: any) => r.food_data as FoodItem)
          } catch {
            return [] as FoodItem[]
          }
        },
      })
    },
    [userId, qc],
  )

  // — Consulta: sugerencias por hora del día —
  const getHourSuggestions = useCallback(
    async (hour: number): Promise<FoodItem[]> => {
      if (!userId) return []
      return qc.fetchQuery({
        queryKey: qk.foodHistory.hour(userId, hour),
        staleTime: 5 * 60_000, // 5 min; las preferencias horarias cambian lento
        queryFn: async () => {
          try {
            const hours = [Math.max(0, hour - 1), hour, Math.min(23, hour + 1)]
            const hourFilter = hours.map(h => `logged_hour = ${h}`).join(' || ')
            const res = await pb.collection('food_history').getList(1, 10, {
              filter: pb.filter(
                `user = {:uid} && usage_count >= 2 && (${hourFilter})`,
                { uid: userId },
              ),
              sort: '-usage_count',
            })
            return res.items.map((r: any) => r.food_data as FoodItem)
          } catch {
            return [] as FoodItem[]
          }
        },
      })
    },
    [userId, qc],
  )

  // — Mutación: registrar alimento consumido —
  const trackMutation = useMutation({
    mutationFn: async ({
      food,
      mealType,
      hour,
    }: {
      food: FoodItem
      mealType: MealType
      hour: number
    }) => {
      if (!userId) return

      // Busca registro existente por nombre de alimento + usuario
      const name = food.name.toLowerCase().trim()
      const existing = await pb.collection('food_history').getList(1, 1, {
        filter: pb.filter('user = {:uid} && food_data.name ~ {:name}', {
          uid: userId,
          name,
        }),
      })

      if (existing.items.length > 0) {
        const rec = existing.items[0]
        await pb.collection('food_history').update(rec.id, {
          food_data: JSON.stringify(food),
          meal_type: mealType,
          logged_hour: hour,
          usage_count: (rec as any).usage_count + 1,
          last_used_at: nowLocalForPB(),
        })
      } else {
        await pb.collection('food_history').create({
          user: userId,
          food_data: JSON.stringify(food),
          meal_type: mealType,
          logged_hour: hour,
          usage_count: 1,
          last_used_at: nowLocalForPB(),
        })
      }
    },
    onSettled: () => {
      // Invalida ambas keys para forzar refresco tras cualquier resultado
      if (!userId) return
      qc.invalidateQueries({ queryKey: ['food_history', 'recent', userId] })
      qc.invalidateQueries({ queryKey: ['food_history', 'hour', userId] })
    },
  })

  // Envuelve la mutación en la misma firma asíncrona que tenía el hook original
  const trackFood = useCallback(
    async (food: FoodItem, mealType: MealType, hour: number) => {
      try {
        await trackMutation.mutateAsync({ food, mealType, hour })
      } catch (e) {
        console.warn('Failed to track food history:', e)
      }
    },
    [trackMutation],
  )

  return { getRecentFoods, getHourSuggestions, trackFood }
}
