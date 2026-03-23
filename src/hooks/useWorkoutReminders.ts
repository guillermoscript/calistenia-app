import { useState, useEffect, useCallback, useRef } from 'react'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'

const LS_KEY = 'calistenia_workout_reminders'

function parseDaysOfWeek(raw: unknown): number[] {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) return parsed } catch {}
  }
  return [1, 2, 3, 4, 5]
}

export interface WorkoutReminder {
  id: string
  hour: number
  minute: number
  daysOfWeek: number[] // 1=Mon..7=Sun
  enabled: boolean
}

const lsGet = (): WorkoutReminder[] => {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] }
}
const lsSet = (d: WorkoutReminder[]) => localStorage.setItem(LS_KEY, JSON.stringify(d))

export function useWorkoutReminders(userId: string | null = null) {
  const [reminders, setReminders] = useState<WorkoutReminder[]>([])
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
          const res = await pb.collection('workout_reminders').getList(1, 50, {
            filter: pb.filter('user = {:uid}', { uid: userId }),
            sort: 'hour,minute',
          })
          const loaded: WorkoutReminder[] = res.items.map((r: any) => ({
            id: r.id,
            hour: r.hour,
            minute: r.minute,
            daysOfWeek: parseDaysOfWeek(r.days_of_week),
            enabled: r.enabled,
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

  // Notification scheduling is handled centrally by reminder-scheduler.ts

  const saveReminder = useCallback(async (hour: number, minute: number, daysOfWeek: number[] = [1, 2, 3, 4, 5]) => {
    const reminder: WorkoutReminder = {
      id: `wr_${Date.now()}`,
      hour,
      minute,
      daysOfWeek,
      enabled: true,
    }

    if (usePB && userId) {
      try {
        const rec = await pb.collection('workout_reminders').create({
          user: userId,
          hour,
          minute,
          days_of_week: daysOfWeek,
          enabled: true,
        })
        reminder.id = rec.id
      } catch (e) { console.warn('PB workout_reminders create error:', e) }
    }

    setReminders(prev => {
      const updated = [...prev, reminder]
      lsSet(updated)
      return updated
    })
  }, [usePB, userId])

  const toggleReminder = useCallback(async (id: string) => {
    const reminder = reminders.find(r => r.id === id)
    if (!reminder) return

    const newEnabled = !reminder.enabled

    if (usePB && !id.startsWith('wr_')) {
      try { await pb.collection('workout_reminders').update(id, { enabled: newEnabled }) } catch {}
    }

    setReminders(prev => {
      const updated = prev.map(r => r.id === id ? { ...r, enabled: newEnabled } : r)
      lsSet(updated)
      return updated
    })
  }, [usePB, reminders])

  const deleteReminder = useCallback(async (id: string) => {
    if (usePB && !id.startsWith('wr_')) {
      try { await pb.collection('workout_reminders').delete(id) } catch {}
    }

    setReminders(prev => {
      const updated = prev.filter(r => r.id !== id)
      lsSet(updated)
      return updated
    })
  }, [usePB])

  return { reminders, saveReminder, toggleReminder, deleteReminder }
}

