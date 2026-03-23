import { useState, useEffect, useCallback, useRef } from 'react'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import type { MealType, MealReminder } from '../types'

const LS_KEY = 'calistenia_meal_reminders'

function parseDaysOfWeek(raw: unknown): number[] {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) return parsed } catch {}
  }
  return [1, 2, 3, 4, 5]
}

const lsGet = (): MealReminder[] => {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] }
}
const lsSet = (d: MealReminder[]) => localStorage.setItem(LS_KEY, JSON.stringify(d))

export function useMealReminders(userId: string | null) {
  const [reminders, setReminders] = useState<MealReminder[]>([])
  const [usePB, setUsePB] = useState(false)
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    const init = async () => {
      const available = userId ? await isPocketBaseAvailable() : false
      setUsePB(available && !!userId)

      if (available && userId) {
        try {
          const res = await pb.collection('meal_reminders').getList(1, 50, {
            filter: pb.filter('user = {:uid}', { uid: userId }),
            sort: 'hour,minute',
          })
          const loaded: MealReminder[] = res.items.map((r: any) => ({
            id: r.id,
            user: r.user,
            mealType: r.meal_type as MealType,
            hour: r.hour,
            minute: r.minute,
            enabled: r.enabled,
            daysOfWeek: parseDaysOfWeek(r.days_of_week),
          }))
          setReminders(loaded)
          lsSet(loaded)
        } catch {
          setReminders(lsGet())
        }
      } else {
        setReminders(lsGet())
      }
    }
    init()
  }, [userId])

  const saveReminder = useCallback(async (
    mealType: MealType,
    hour: number,
    minute: number,
    daysOfWeek: number[] = [1, 2, 3, 4, 5],
  ): Promise<void> => {
    const reminder: MealReminder = {
      id: `mr_${Date.now()}`,
      mealType,
      hour,
      minute,
      enabled: true,
      daysOfWeek,
    }

    if (usePB && userId) {
      try {
        const rec = await pb.collection('meal_reminders').create({
          user: userId,
          meal_type: mealType,
          hour,
          minute,
          enabled: true,
          days_of_week: daysOfWeek,
        })
        reminder.id = rec.id
      } catch (e) { console.warn('PB meal_reminders create error:', e) }
    }

    setReminders(prev => {
      const updated = [...prev, reminder]
      lsSet(updated)
      return updated
    })
  }, [usePB, userId])

  const updateReminder = useCallback(async (id: string, hour: number, minute: number, daysOfWeek: number[]): Promise<void> => {
    if (usePB && !id.startsWith('mr_')) {
      try { await pb.collection('meal_reminders').update(id, { hour, minute, days_of_week: daysOfWeek }) } catch {}
    }

    setReminders(prev => {
      const updated = prev.map(r => r.id === id ? { ...r, hour, minute, daysOfWeek } : r)
      lsSet(updated)
      return updated
    })
  }, [usePB])

  const toggleReminder = useCallback(async (id: string, enabled: boolean): Promise<void> => {
    if (usePB && !id.startsWith('mr_')) {
      try { await pb.collection('meal_reminders').update(id, { enabled }) } catch {}
    }

    setReminders(prev => {
      const updated = prev.map(r => r.id === id ? { ...r, enabled } : r)
      lsSet(updated)
      return updated
    })
  }, [usePB])

  const deleteReminder = useCallback(async (id: string): Promise<void> => {
    if (usePB && !id.startsWith('mr_')) {
      try { await pb.collection('meal_reminders').delete(id) } catch {}
    }

    setReminders(prev => {
      const updated = prev.filter(r => r.id !== id)
      lsSet(updated)
      return updated
    })
  }, [usePB])

  return { reminders, saveReminder, updateReminder, toggleReminder, deleteReminder }
}
