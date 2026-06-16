import { storage } from '../platform'
import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'

const LS_KEY = 'calistenia_workout_reminders'

function parseDaysOfWeek(raw: unknown): number[] {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) return parsed } catch {}
  }
  return [1, 2, 3, 4, 5]
}

export type ReminderSubtype = 'workout' | 'pause'

export interface WorkoutReminder {
  id: string
  hour: number
  minute: number
  daysOfWeek: number[] // 1=Mon..7=Sun
  enabled: boolean
  reminderType: ReminderSubtype
}

// ── localStorage helpers ──────────────────────────────────────────────────────

const lsGet = (): WorkoutReminder[] => {
  try {
    const raw = JSON.parse(storage.getItem(LS_KEY) || '[]')
    return raw.map((r: any) => ({ ...r, reminderType: r.reminderType || 'workout' }))
  } catch { return [] }
}
const lsSet = (d: WorkoutReminder[]) => {
  try { storage.setItem(LS_KEY, JSON.stringify(d)) } catch { /* storage lleno */ }
}

/**
 * Recordatorios de entrenamiento (workout + pause). Offline-first: localStorage
 * es la fuente inmediata (initialData), PocketBase es autoritativo al cargar.
 * Mutaciones optimistas con write-through a local. Forma pública estable
 * idéntica al hook previo:
 * { reminders, saveReminder, updateReminder, toggleReminder, deleteReminder }.
 *
 * Notification scheduling queda en reminder-scheduler.ts (sin cambios).
 */
export function useWorkoutReminders(userId: string | null = null) {
  const qc = useQueryClient()
  const key = qk.workoutReminders(userId)

  // ── Query principal ───────────────────────────────────────────────────────

  const { data: reminders = [] } = useQuery<WorkoutReminder[]>({
    queryKey: key,
    // initialData = local → disponible aun offline / sin sesión.
    initialData: lsGet,
    initialDataUpdatedAt: 0, // fuerza refetch al montar para fusionar con PB
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await pb.collection('workout_reminders').getList(1, 50, {
        filter: pb.filter('user = {:uid}', { uid: userId! }),
        sort: 'hour,minute',
      })
      const loaded: WorkoutReminder[] = res.items.map((r: any) => ({
        id: r.id,
        hour: r.hour,
        minute: r.minute,
        daysOfWeek: parseDaysOfWeek(r.days_of_week),
        enabled: r.enabled,
        reminderType: (r.reminder_type === 'pause' ? 'pause' : 'workout') as ReminderSubtype,
      }))
      lsSet(loaded)
      return loaded
    },
  })

  // ── Mutación: saveReminder ────────────────────────────────────────────────

  const saveMutation = useMutation<
    WorkoutReminder,
    Error,
    { hour: number; minute: number; daysOfWeek: number[]; reminderType: ReminderSubtype }
  >({
    mutationFn: async ({ hour, minute, daysOfWeek, reminderType }) => {
      if (!userId) throw new Error('sin sesión')
      const rec = await pb.collection('workout_reminders').create({
        user: userId,
        hour,
        minute,
        days_of_week: daysOfWeek,
        enabled: true,
        reminder_type: reminderType,
      })
      return {
        id: rec.id,
        hour,
        minute,
        daysOfWeek,
        enabled: true,
        reminderType,
      }
    },
    onMutate: async ({ hour, minute, daysOfWeek, reminderType }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<WorkoutReminder[]>(key) ?? lsGet()

      // Entrada optimista con id wr_ mientras PB no confirma.
      const optimistic: WorkoutReminder = {
        id: `wr_${Date.now()}`,
        hour,
        minute,
        daysOfWeek,
        enabled: true,
        reminderType,
      }
      const next = [...prev, optimistic]
      lsSet(next)
      qc.setQueryData(key, next)
      return { prev, optimistic }
    },
    onSuccess: (confirmed, _, ctx: any) => {
      // Reemplaza el id wr_ por el id real de PB.
      const current = qc.getQueryData<WorkoutReminder[]>(key) ?? []
      const next = current.map(r =>
        r.id === ctx?.optimistic?.id ? confirmed : r,
      )
      lsSet(next)
      qc.setQueryData(key, next)
    },
    onError: (_err, _vars, ctx: any) => {
      if (ctx?.prev) {
        lsSet(ctx.prev)
        qc.setQueryData(key, ctx.prev)
      }
    },
  })

  // ── Mutación: toggleReminder ──────────────────────────────────────────────
  // Variables: { id, newEnabled } — enviamos el valor objetivo explícito para
  // evitar race entre onMutate (ya voltea el caché) y mutationFn (que leería
  // el valor ya volteado si leyera del caché).

  const toggleMutation = useMutation<void, Error, { id: string; newEnabled: boolean }>({
    mutationFn: async ({ id, newEnabled }) => {
      // Los ids wr_ nunca llegaron a PB; ids reales sí se sincronizan.
      if (!userId || id.startsWith('wr_')) return
      await pb.collection('workout_reminders').update(id, { enabled: newEnabled })
    },
    onMutate: async ({ id, newEnabled }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<WorkoutReminder[]>(key) ?? lsGet()
      const next = prev.map(r => r.id === id ? { ...r, enabled: newEnabled } : r)
      lsSet(next)
      qc.setQueryData(key, next)
      return { prev }
    },
    onError: (_err, _vars, ctx: any) => {
      if (ctx?.prev) {
        lsSet(ctx.prev)
        qc.setQueryData(key, ctx.prev)
      }
    },
  })

  // ── Mutación: updateReminder ──────────────────────────────────────────────

  const updateMutation = useMutation<
    void,
    Error,
    { id: string; hour: number; minute: number; daysOfWeek: number[] }
  >({
    mutationFn: async ({ id, hour, minute, daysOfWeek }) => {
      if (!userId || id.startsWith('wr_')) return
      await pb.collection('workout_reminders').update(id, {
        hour,
        minute,
        days_of_week: daysOfWeek,
      })
    },
    onMutate: async ({ id, hour, minute, daysOfWeek }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<WorkoutReminder[]>(key) ?? lsGet()
      const next = prev.map(r => r.id === id ? { ...r, hour, minute, daysOfWeek } : r)
      lsSet(next)
      qc.setQueryData(key, next)
      return { prev }
    },
    onError: (_err, _vars, ctx: any) => {
      if (ctx?.prev) {
        lsSet(ctx.prev)
        qc.setQueryData(key, ctx.prev)
      }
    },
  })

  // ── Mutación: deleteReminder ──────────────────────────────────────────────

  const deleteMutation = useMutation<void, Error, string>({
    mutationFn: async (id) => {
      if (!userId || id.startsWith('wr_')) return
      await pb.collection('workout_reminders').delete(id)
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<WorkoutReminder[]>(key) ?? lsGet()
      const next = prev.filter(r => r.id !== id)
      lsSet(next)
      qc.setQueryData(key, next)
      return { prev }
    },
    onError: (_err, _id, ctx: any) => {
      if (ctx?.prev) {
        lsSet(ctx.prev)
        qc.setQueryData(key, ctx.prev)
      }
    },
  })

  // ── Interfaz pública (idéntica al hook anterior) ──────────────────────────

  const saveReminder = useCallback(
    async (
      hour: number,
      minute: number,
      daysOfWeek: number[] = [1, 2, 3, 4, 5],
      reminderType: ReminderSubtype = 'workout',
    ) => {
      if (userId) {
        await saveMutation.mutateAsync({ hour, minute, daysOfWeek, reminderType }).catch(() => {})
      } else {
        // Sin sesión: solo local.
        const reminder: WorkoutReminder = {
          id: `wr_${Date.now()}`,
          hour,
          minute,
          daysOfWeek,
          enabled: true,
          reminderType,
        }
        qc.setQueryData<WorkoutReminder[]>(key, (prev = []) => {
          const next = [...prev, reminder]
          lsSet(next)
          return next
        })
      }
    },
    [userId, saveMutation, qc, key],
  )

  const toggleReminder = useCallback(
    async (id: string) => {
      const current = qc.getQueryData<WorkoutReminder[]>(key) ?? lsGet()
      const reminder = current.find(r => r.id === id)
      if (!reminder) return
      await toggleMutation.mutateAsync({ id, newEnabled: !reminder.enabled }).catch(() => {})
    },
    [toggleMutation, qc, key],
  )

  const updateReminder = useCallback(
    async (id: string, hour: number, minute: number, daysOfWeek: number[]) => {
      await updateMutation.mutateAsync({ id, hour, minute, daysOfWeek }).catch(() => {})
    },
    [updateMutation],
  )

  const deleteReminder = useCallback(
    async (id: string) => {
      await deleteMutation.mutateAsync(id).catch(() => {})
    },
    [deleteMutation],
  )

  return { reminders, saveReminder, updateReminder, toggleReminder, deleteReminder }
}
