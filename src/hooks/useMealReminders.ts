import { useCallback } from 'react'
import { pb } from '../lib/pocketbase'
import type { MealType, MealReminder } from '../types'

export function useMealReminders(userId: string | null) {
  const getReminders = useCallback(async (): Promise<MealReminder[]> => {
    if (!userId) return []
    try {
      const res = await pb.collection('meal_reminders').getList(1, 20, {
        filter: pb.filter('user = {:uid}', { uid: userId }),
        sort: 'hour,minute',
      })
      return res.items.map((r: any) => ({
        id: r.id,
        user: r.user,
        mealType: r.meal_type as MealType,
        hour: r.hour,
        minute: r.minute,
        enabled: r.enabled,
        daysOfWeek: r.days_of_week || [1, 2, 3, 4, 5],
      }))
    } catch {
      return []
    }
  }, [userId])

  const saveReminder = useCallback(async (
    mealType: MealType,
    hour: number,
    minute: number,
    daysOfWeek: number[] = [1, 2, 3, 4, 5],
  ): Promise<void> => {
    if (!userId) return
    await pb.collection('meal_reminders').create({
      user: userId,
      meal_type: mealType,
      hour,
      minute,
      enabled: true,
      days_of_week: JSON.stringify(daysOfWeek),
    })
  }, [userId])

  const toggleReminder = useCallback(async (id: string, enabled: boolean): Promise<void> => {
    await pb.collection('meal_reminders').update(id, { enabled })
  }, [])

  const deleteReminder = useCallback(async (id: string): Promise<void> => {
    await pb.collection('meal_reminders').delete(id)
  }, [])

  return { getReminders, saveReminder, toggleReminder, deleteReminder }
}
