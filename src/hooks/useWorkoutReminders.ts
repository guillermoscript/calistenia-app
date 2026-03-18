import { useState, useEffect, useCallback } from 'react'

const LS_KEY = 'calistenia_workout_reminders'

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

export function useWorkoutReminders() {
  const [reminders, setReminders] = useState<WorkoutReminder[]>(() => lsGet())

  const saveReminder = useCallback((hour: number, minute: number, daysOfWeek: number[] = [1, 2, 3, 4, 5]) => {
    const reminder: WorkoutReminder = {
      id: `wr_${Date.now()}`,
      hour,
      minute,
      daysOfWeek,
      enabled: true,
    }
    setReminders(prev => {
      const updated = [...prev, reminder]
      lsSet(updated)
      return updated
    })

    // Schedule browser notification
    scheduleNotification(reminder)
  }, [])

  const toggleReminder = useCallback((id: string) => {
    setReminders(prev => {
      const updated = prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r)
      lsSet(updated)
      return updated
    })
  }, [])

  const deleteReminder = useCallback((id: string) => {
    setReminders(prev => {
      const updated = prev.filter(r => r.id !== id)
      lsSet(updated)
      return updated
    })
  }, [])

  // On mount, schedule all enabled reminders
  useEffect(() => {
    reminders.filter(r => r.enabled).forEach(scheduleNotification)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { reminders, saveReminder, toggleReminder, deleteReminder }
}

function scheduleNotification(reminder: WorkoutReminder) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return

  const now = new Date()
  const today = now.getDay() === 0 ? 7 : now.getDay() // Convert to 1=Mon..7=Sun
  if (!reminder.daysOfWeek.includes(today)) return

  const target = new Date()
  target.setHours(reminder.hour, reminder.minute, 0, 0)
  const delay = target.getTime() - now.getTime()

  if (delay > 0 && delay < 24 * 60 * 60 * 1000) {
    setTimeout(() => {
      new Notification('Hora de entrenar!', {
        body: 'Tu entrenamiento te espera. No pierdas la racha!',
        icon: '/icon-192.png',
      })
    }, delay)
  }
}
