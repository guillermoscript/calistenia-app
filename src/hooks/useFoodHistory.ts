import { useCallback } from 'react'
import { pb } from '../lib/pocketbase'
import type { FoodItem, MealType } from '../types'

export function useFoodHistory(userId: string | null) {
  const getRecentFoods = useCallback(async (limit = 8): Promise<FoodItem[]> => {
    if (!userId) return []
    try {
      const res = await pb.collection('food_history').getList(1, limit, {
        filter: pb.filter('user = {:uid}', { uid: userId }),
        sort: '-last_used_at',
      })
      return res.items.map((r: any) => r.food_data as FoodItem)
    } catch {
      return []
    }
  }, [userId])

  const getHourSuggestions = useCallback(async (hour: number): Promise<FoodItem[]> => {
    if (!userId) return []
    try {
      const hours = [Math.max(0, hour - 1), hour, Math.min(23, hour + 1)]
      const hourFilter = hours.map(h => `logged_hour = ${h}`).join(' || ')
      const res = await pb.collection('food_history').getList(1, 10, {
        filter: pb.filter(`user = {:uid} && usage_count >= 2 && (${hourFilter})`, { uid: userId }),
        sort: '-usage_count',
      })
      return res.items.map((r: any) => r.food_data as FoodItem)
    } catch {
      return []
    }
  }, [userId])

  const trackFood = useCallback(async (food: FoodItem, mealType: MealType, hour: number) => {
    if (!userId) return
    try {
      // Try to find existing record for this food name + user
      const name = food.name.toLowerCase().trim()
      const existing = await pb.collection('food_history').getList(1, 1, {
        filter: pb.filter('user = {:uid} && food_data.name ~ {:name}', { uid: userId, name }),
      })

      if (existing.items.length > 0) {
        const rec = existing.items[0]
        await pb.collection('food_history').update(rec.id, {
          food_data: JSON.stringify(food),
          meal_type: mealType,
          logged_hour: hour,
          usage_count: (rec as any).usage_count + 1,
          last_used_at: new Date().toISOString(),
        })
      } else {
        await pb.collection('food_history').create({
          user: userId,
          food_data: JSON.stringify(food),
          meal_type: mealType,
          logged_hour: hour,
          usage_count: 1,
          last_used_at: new Date().toISOString(),
        })
      }
    } catch (e) {
      console.warn('Failed to track food history:', e)
    }
  }, [userId])

  return { getRecentFoods, getHourSuggestions, trackFood }
}
