import { useCallback } from 'react'
import { pb } from '../lib/pocketbase'
import { nowLocalForPB } from '../lib/dateUtils'
import type { FoodItem, MealType, MealTemplate } from '../types'

export function useMealTemplates(userId: string | null) {
  const getTemplates = useCallback(async (): Promise<MealTemplate[]> => {
    if (!userId) return []
    try {
      const res = await pb.collection('meal_templates').getList(1, 50, {
        filter: pb.filter('user = {:uid}', { uid: userId }),
        sort: '-usage_count',
      })
      return res.items.map((r: any) => ({
        id: r.id,
        user: r.user,
        name: r.name,
        foods: r.foods as FoodItem[],
        mealType: r.meal_type as MealType,
        usageCount: r.usage_count || 0,
        lastUsedAt: r.last_used_at || '',
      }))
    } catch {
      return []
    }
  }, [userId])

  const saveTemplate = useCallback(async (name: string, foods: FoodItem[], mealType: MealType): Promise<void> => {
    if (!userId) return
    await pb.collection('meal_templates').create({
      user: userId,
      name,
      foods: JSON.stringify(foods),
      meal_type: mealType,
      usage_count: 0,
      last_used_at: nowLocalForPB(),
    })
  }, [userId])

  const useTemplate = useCallback(async (id: string): Promise<FoodItem[]> => {
    const rec: any = await pb.collection('meal_templates').getOne(id)
    await pb.collection('meal_templates').update(id, {
      usage_count: (rec.usage_count || 0) + 1,
      last_used_at: nowLocalForPB(),
    })
    return rec.foods as FoodItem[]
  }, [])

  const deleteTemplate = useCallback(async (id: string): Promise<void> => {
    await pb.collection('meal_templates').delete(id)
  }, [])

  return { getTemplates, saveTemplate, useTemplate, deleteTemplate }
}
