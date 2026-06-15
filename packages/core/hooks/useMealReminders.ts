import { storage } from '../platform'
import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'
import type { MealType, MealReminder } from '../types'

// ─── Persistencia local ───────────────────────────────────────────────────────

const LS_KEY = 'calistenia_meal_reminders'

const lsGet = (): MealReminder[] => {
  try { return JSON.parse(storage.getItem(LS_KEY) || '[]') } catch { return [] }
}
const lsSet = (d: MealReminder[]) => {
  try { storage.setItem(LS_KEY, JSON.stringify(d)) } catch { /* storage lleno */ }
}

// ─── Parser de días de la semana (PB puede devolver JSON string) ──────────────

function parseDaysOfWeek(raw: unknown): number[] {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) return parsed } catch {}
  }
  return [1, 2, 3, 4, 5]
}

// ─── useMealReminders ─────────────────────────────────────────────────────────

/**
 * Recordatorios de comidas. Offline-first con TanStack Query:
 *
 * - `qk.pbAvailable` (staleTime 30s): sonda de disponibilidad de PocketBase;
 *   compartida/deduplicada entre todos los hooks que la usen.
 * - `qk.mealReminders(userId)`: lista de recordatorios; initialData desde LS
 *   para disponibilidad inmediata offline.
 * - Las 4 mutaciones (save/update/toggle/delete) son optimistas: en `onMutate`
 *   actualizan caché + LS; `onError` revierte ambos; `onSuccess` invalida para
 *   re-sincronizar con PB.
 * - Guarda `mr_` en IDs locales temporales (saveReminder offline). El guard
 *   `!id.startsWith('mr_')` impide intentar operaciones PB sobre IDs locales.
 *
 * Forma pública estable: { reminders, saveReminder, updateReminder, toggleReminder, deleteReminder }
 */
export function useMealReminders(userId: string | null) {
  const qc = useQueryClient()

  // ── Sonda de disponibilidad de PocketBase ──────────────────────────────────
  // Key compartida `qk.pbAvailable` — si otro hook ya la consultó, se reutiliza.
  const { data: pbAvailable = false } = useQuery({
    queryKey: qk.pbAvailable,
    queryFn: () => isPocketBaseAvailable(),
    staleTime: 30_000,
    enabled: !!userId,
  })

  // usePB = PB disponible Y hay sesión
  const usePB = pbAvailable && !!userId

  // ── Query principal de recordatorios ───────────────────────────────────────
  const remindersKey = qk.mealReminders(userId)

  const { data: reminders = [] } = useQuery<MealReminder[]>({
    queryKey: remindersKey,
    // initialData desde LS — disponible offline / sin sesión desde el primer render
    initialData: lsGet,
    initialDataUpdatedAt: 0, // fuerza refetch al montar para fusionar con PB
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // Si PB no está disponible, devolvemos lo que hay en LS
      const available = await isPocketBaseAvailable()
      if (!available || !userId) return lsGet()

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
        // Sincronizar LS con la fuente autoritativa de PB
        lsSet(loaded)
        return loaded
      } catch {
        // PB falló: caemos a LS como respaldo
        return lsGet()
      }
    },
  })

  // ── Mutación: crear recordatorio ───────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async (payload: {
      mealType: MealType
      hour: number
      minute: number
      daysOfWeek: number[]
      tempId: string
    }) => {
      if (!usePB || !userId) return null // sin PB, todo queda en LS (onMutate ya lo hizo)
      try {
        const rec = await pb.collection('meal_reminders').create({
          user: userId,
          meal_type: payload.mealType,
          hour: payload.hour,
          minute: payload.minute,
          enabled: true,
          days_of_week: payload.daysOfWeek,
        })
        return { pbId: rec.id, tempId: payload.tempId }
      } catch (e) {
        console.warn('PB meal_reminders create error:', e)
        return null
      }
    },
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: remindersKey })
      const prev = qc.getQueryData<MealReminder[]>(remindersKey) ?? lsGet()

      // Recordatorio optimista con id temporal `mr_`
      const optimistic: MealReminder = {
        id: payload.tempId,
        mealType: payload.mealType,
        hour: payload.hour,
        minute: payload.minute,
        enabled: true,
        daysOfWeek: payload.daysOfWeek,
      }
      const next = [...prev, optimistic]
      lsSet(next)
      qc.setQueryData(remindersKey, next)
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      // Revertir optimismo
      if (ctx?.prev) {
        lsSet(ctx.prev)
        qc.setQueryData(remindersKey, ctx.prev)
      }
    },
    onSuccess: (result) => {
      if (!result) return
      // Reemplazar el id temporal `mr_` por el id real de PB
      qc.setQueryData<MealReminder[]>(remindersKey, (old = []) => {
        const updated = old.map(r =>
          r.id === result.tempId ? { ...r, id: result.pbId } : r,
        )
        lsSet(updated)
        return updated
      })
    },
  })

  // ── Mutación: actualizar recordatorio ──────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: async (payload: { id: string; hour: number; minute: number; daysOfWeek: number[] }) => {
      // Guard `mr_`: IDs locales no existen en PB — solo actualizar si tiene id real
      if (usePB && !payload.id.startsWith('mr_')) {
        await pb.collection('meal_reminders').update(payload.id, {
          hour: payload.hour,
          minute: payload.minute,
          days_of_week: payload.daysOfWeek,
        })
      }
    },
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: remindersKey })
      const prev = qc.getQueryData<MealReminder[]>(remindersKey) ?? lsGet()
      const next = prev.map(r =>
        r.id === payload.id ? { ...r, hour: payload.hour, minute: payload.minute, daysOfWeek: payload.daysOfWeek } : r,
      )
      lsSet(next)
      qc.setQueryData(remindersKey, next)
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        lsSet(ctx.prev)
        qc.setQueryData(remindersKey, ctx.prev)
      }
    },
  })

  // ── Mutación: activar/desactivar recordatorio ──────────────────────────────
  const toggleMutation = useMutation({
    mutationFn: async (payload: { id: string; enabled: boolean }) => {
      // Guard `mr_`: solo sincronizar con PB si el id es real
      if (usePB && !payload.id.startsWith('mr_')) {
        try {
          await pb.collection('meal_reminders').update(payload.id, { enabled: payload.enabled })
        } catch { /* fallo silencioso — el estado local ya se actualizó */ }
      }
    },
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: remindersKey })
      const prev = qc.getQueryData<MealReminder[]>(remindersKey) ?? lsGet()
      const next = prev.map(r =>
        r.id === payload.id ? { ...r, enabled: payload.enabled } : r,
      )
      lsSet(next)
      qc.setQueryData(remindersKey, next)
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        lsSet(ctx.prev)
        qc.setQueryData(remindersKey, ctx.prev)
      }
    },
  })

  // ── Mutación: eliminar recordatorio ───────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // Guard `mr_`: solo borrar en PB si el id es real
      if (usePB && !id.startsWith('mr_')) {
        try {
          await pb.collection('meal_reminders').delete(id)
        } catch { /* fallo silencioso — LS ya lo eliminó */ }
      }
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: remindersKey })
      const prev = qc.getQueryData<MealReminder[]>(remindersKey) ?? lsGet()
      const next = prev.filter(r => r.id !== id)
      lsSet(next)
      qc.setQueryData(remindersKey, next)
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        lsSet(ctx.prev)
        qc.setQueryData(remindersKey, ctx.prev)
      }
    },
  })

  // ── API pública (forma idéntica a la versión useState) ────────────────────

  const saveReminder = useCallback(async (
    mealType: MealType,
    hour: number,
    minute: number,
    daysOfWeek: number[] = [1, 2, 3, 4, 5],
  ): Promise<void> => {
    // `mr_` como prefijo del id temporal para identificar recordatorios locales
    const tempId = `mr_${Date.now()}`
    await saveMutation.mutateAsync({ mealType, hour, minute, daysOfWeek, tempId })
  }, [saveMutation])

  const updateReminder = useCallback(async (
    id: string,
    hour: number,
    minute: number,
    daysOfWeek: number[],
  ): Promise<void> => {
    await updateMutation.mutateAsync({ id, hour, minute, daysOfWeek })
  }, [updateMutation])

  const toggleReminder = useCallback(async (
    id: string,
    enabled: boolean,
  ): Promise<void> => {
    await toggleMutation.mutateAsync({ id, enabled })
  }, [toggleMutation])

  const deleteReminder = useCallback(async (id: string): Promise<void> => {
    await deleteMutation.mutateAsync(id)
  }, [deleteMutation])

  return { reminders, saveReminder, updateReminder, toggleReminder, deleteReminder }
}
