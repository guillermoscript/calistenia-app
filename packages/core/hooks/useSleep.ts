import { storage } from '../platform'
import { useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { daysAgoStr, nowLocalForPB } from '../lib/dateUtils'
import { qk } from '../lib/query-keys'
import type { SleepEntry } from '../types'

const LS_KEY = 'calistenia_sleep_entries'

// — Helpers de localStorage —
const lsGet = (): SleepEntry[] => {
  try { return JSON.parse(storage.getItem(LS_KEY) || '[]') } catch { return [] }
}
const lsSet = (d: SleepEntry[]) => {
  try { storage.setItem(LS_KEY, JSON.stringify(d)) } catch { /* storage lleno */ }
}

/**
 * Calcula la duración en minutos desde bedtime hasta wake_time, manejando
 * el cruce de medianoche. Ambos tiempos son strings "HH:MM".
 */
export const calculateDurationMinutes = (bedtime: string, wakeTime: string): number => {
  const [bH, bM] = bedtime.split(':').map(Number)
  const [wH, wM] = wakeTime.split(':').map(Number)
  let bedMin = bH * 60 + bM
  let wakeMin = wH * 60 + wM
  if (wakeMin <= bedMin) {
    // cruce de medianoche: ej. 23:30 -> 07:15
    wakeMin += 24 * 60
  }
  return wakeMin - bedMin
}

/**
 * Retorna true si el usuario "durmió bien" en la fecha dada (quality >= 3).
 * Retorna null si no hay entrada para esa fecha.
 */
export const didSleepWell = (entries: SleepEntry[], date: string): boolean | null => {
  const entry = entries.find(e => e.date === date)
  if (!entry) return null
  return entry.quality >= 3
}

export interface SleepStats {
  avgDuration: number
  avgQuality: number
  avgAwakenings: number
  avgAwakeMinutes: number
  scheduleRegularity: number // desviación estándar del horario de dormir en minutos
  entryCount: number
}

const computeStats = (entries: SleepEntry[]): SleepStats => {
  if (entries.length === 0) {
    return { avgDuration: 0, avgQuality: 0, avgAwakenings: 0, avgAwakeMinutes: 0, scheduleRegularity: 0, entryCount: 0 }
  }

  const n = entries.length
  const avgDuration = entries.reduce((s, e) => s + e.duration_minutes, 0) / n
  const avgQuality = entries.reduce((s, e) => s + e.quality, 0) / n
  const avgAwakenings = entries.reduce((s, e) => s + e.awakenings, 0) / n

  // Promedio de minutos despierto — solo sobre entradas que tienen el campo
  const awakeEntries = entries.filter(e => e.awake_minutes && e.awake_minutes > 0)
  const avgAwakeMinutes = awakeEntries.length > 0
    ? awakeEntries.reduce((s, e) => s + (e.awake_minutes ?? 0), 0) / awakeEntries.length
    : 0

  // Regularidad del horario: desviación estándar del bedtime (en minutos desde medianoche)
  const bedtimeMinutes = entries.map(e => {
    const [h, m] = e.bedtime.split(':').map(Number)
    // Normalizar: tiempos antes de 12:00 son "día siguiente" (ej. 01:00 = 25*60)
    return h < 12 ? (h + 24) * 60 + m : h * 60 + m
  })
  const meanBedtime = bedtimeMinutes.reduce((s, v) => s + v, 0) / n
  const variance = bedtimeMinutes.reduce((s, v) => s + (v - meanBedtime) ** 2, 0) / n
  const scheduleRegularity = Math.sqrt(variance)

  return {
    avgDuration: Math.round(avgDuration * 10) / 10,
    avgQuality: Math.round(avgQuality * 10) / 10,
    avgAwakenings: Math.round(avgAwakenings * 10) / 10,
    avgAwakeMinutes: Math.round(avgAwakeMinutes * 10) / 10,
    scheduleRegularity: Math.round(scheduleRegularity * 10) / 10,
    entryCount: n,
  }
}

export type SleepEntryInput = Omit<SleepEntry, 'id' | 'user' | 'duration_minutes' | 'created' | 'updated'>

interface UseSleepReturn {
  entries: SleepEntry[]
  isReady: boolean
  weeklyStats: SleepStats
  saveSleepEntry: (input: SleepEntryInput) => Promise<void>
  updateSleepEntry: (id: string, input: Partial<SleepEntryInput>) => Promise<void>
  deleteSleepEntry: (id: string) => Promise<void>
  didSleepWell: (date: string) => boolean | null
}

/**
 * Entradas de sueño. Offline-first: localStorage es la fuente inmediata
 * (initialData), PocketBase es autoritativo y se fusiona al cargar.
 * Las mutaciones son optimistas y escriben a localStorage en onMutate;
 * PB se sincroniza en segundo plano. Forma pública estable: UseSleepReturn.
 */
export function useSleep(userId: string | null = null): UseSleepReturn {
  const qc = useQueryClient()
  const key = qk.sleep(userId)

  // — Query principal: initialData desde localStorage, refetch desde PB —
  const { data: entries = [], isFetched } = useQuery<SleepEntry[]>({
    queryKey: key,
    // initialData desde localStorage → disponible aun offline / sin sesión
    initialData: lsGet,
    initialDataUpdatedAt: 0, // fuerza refetch al montar para fusionar con PB
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // getFullList elimina el límite implícito de 500: obtiene todas las entradas del usuario
      const res = await pb.collection('sleep_entries').getFullList({
        filter: pb.filter('user = {:uid}', { uid: userId! }),
        sort: '-date',
      })
      const items: SleepEntry[] = res.map((r: any) => ({
        id: r.id,
        user: r.user,
        // Normalizar fecha: PB devuelve 'YYYY-MM-DD 00:00:00', tomamos solo la parte de fecha
        date: r.date?.split(' ')[0] || r.date,
        bedtime: r.bedtime,
        wake_time: r.wake_time,
        awakenings: r.awakenings,
        quality: r.quality,
        duration_minutes: r.duration_minutes,
        awake_minutes: r.awake_minutes || undefined,
        caffeine: r.caffeine ?? undefined,
        screen_before_bed: r.screen_before_bed ?? undefined,
        stress_level: r.stress_level || undefined,
        note: r.note || undefined,
        created: r.created,
        updated: r.updated,
      }))
      // Escribir a localStorage para tener caché offline actualizado
      lsSet(items)
      return items
    },
  })

  // isReady: true cuando ya corrió al menos el initialData o el fetch completó
  const isReady = !userId ? true : isFetched || entries.length > 0

  // — Stats semanales: últimos 7 días —
  const weeklyStats = useMemo(() => {
    const cutoff = daysAgoStr(7)
    const recent = entries.filter(e => e.date >= cutoff)
    return computeStats(recent)
  }, [entries])

  // — Mutación: guardar nueva entrada (optimista) —
  const saveMutation = useMutation({
    mutationFn: async (input: SleepEntryInput) => {
      if (!userId) return
      const totalInBed = calculateDurationMinutes(input.bedtime, input.wake_time)
      const duration_minutes = Math.max(0, totalInBed - (input.awake_minutes ?? 0))
      const rec = await pb.collection('sleep_entries').create({
        user: userId,
        // Normalizar fecha a 'YYYY-MM-DD 00:00:00' para PocketBase
        date: input.date + ' 00:00:00',
        bedtime: input.bedtime,
        wake_time: input.wake_time,
        awakenings: input.awakenings,
        quality: input.quality,
        duration_minutes,
        awake_minutes: input.awake_minutes ?? 0,
        caffeine: input.caffeine ?? null,
        screen_before_bed: input.screen_before_bed ?? null,
        stress_level: input.stress_level ?? null,
        note: input.note || '',
      })
      return rec
    },
    onMutate: async (input: SleepEntryInput) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<SleepEntry[]>(key) ?? lsGet()
      const totalInBed = calculateDurationMinutes(input.bedtime, input.wake_time)
      const duration_minutes = Math.max(0, totalInBed - (input.awake_minutes ?? 0))
      const now = nowLocalForPB()
      // Guardia local_: id temporal hasta confirmar con PB
      const optimistic: SleepEntry = {
        ...input,
        id: `local_${Date.now()}`,
        user: userId || '',
        duration_minutes,
        created: now,
        updated: now,
      }
      const next = [optimistic, ...prev].sort((a, b) => b.date.localeCompare(a.date))
      lsSet(next)
      qc.setQueryData(key, next)
      return { prev }
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) {
        lsSet(ctx.prev)
        qc.setQueryData(key, ctx.prev)
      }
    },
    onSuccess: (rec, input) => {
      if (!rec) return
      // Reemplazar el id local_ con el id real de PB
      qc.setQueryData(key, (old: SleepEntry[] = []) => {
        const updated = old.map(e =>
          e.id.startsWith('local_') && e.date === input.date
            ? {
                ...e,
                id: rec.id,
                created: rec.created,
                updated: rec.updated,
              }
            : e
        )
        lsSet(updated)
        return updated
      })
    },
  })

  // — Mutación: actualizar entrada existente (optimista) —
  const updateMutation = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<SleepEntryInput> }) => {
      if (!userId || id.startsWith('local_')) return
      const data: Record<string, any> = { ...input }
      // Recalcular duration_minutes si cambian bedtime, wake_time o awake_minutes
      if (input.bedtime || input.wake_time || input.awake_minutes !== undefined) {
        const current = (qc.getQueryData<SleepEntry[]>(key) ?? []).find(e => e.id === id)
        if (current) {
          const bedtime = input.bedtime ?? current.bedtime
          const wake_time = input.wake_time ?? current.wake_time
          const awakeMin = input.awake_minutes ?? current.awake_minutes ?? 0
          data.duration_minutes = Math.max(0, calculateDurationMinutes(bedtime, wake_time) - awakeMin)
        }
      }
      if (input.date) {
        // Normalizar fecha a 'YYYY-MM-DD 00:00:00' para PocketBase
        data.date = input.date + ' 00:00:00'
      }
      await pb.collection('sleep_entries').update(id, data)
    },
    onMutate: async ({ id, input }: { id: string; input: Partial<SleepEntryInput> }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<SleepEntry[]>(key) ?? lsGet()
      const next = prev.map(entry => {
        if (entry.id !== id) return entry
        const merged = { ...entry, ...input, updated: nowLocalForPB() }
        if (input.bedtime || input.wake_time || input.awake_minutes !== undefined) {
          const totalInBed = calculateDurationMinutes(merged.bedtime, merged.wake_time)
          merged.duration_minutes = Math.max(0, totalInBed - (merged.awake_minutes ?? 0))
        }
        return merged
      }).sort((a, b) => b.date.localeCompare(a.date))
      lsSet(next)
      qc.setQueryData(key, next)
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        lsSet(ctx.prev)
        qc.setQueryData(key, ctx.prev)
      }
    },
  })

  // — Mutación: borrar entrada (optimista) —
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // Guardia local_: no intentar borrar en PB si es id temporal
      if (id.startsWith('local_')) return
      await pb.collection('sleep_entries').delete(id)
    },
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<SleepEntry[]>(key) ?? lsGet()
      const next = prev.filter(e => e.id !== id)
      lsSet(next)
      qc.setQueryData(key, next)
      return { prev }
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) {
        lsSet(ctx.prev)
        qc.setQueryData(key, ctx.prev)
      }
    },
  })

  // — Wrappers de API pública (misma forma que el hook original) —
  const saveSleepEntry = useCallback(
    (input: SleepEntryInput) => saveMutation.mutateAsync(input).then(() => {}),
    [saveMutation],
  )

  const updateSleepEntry = useCallback(
    (id: string, input: Partial<SleepEntryInput>) =>
      updateMutation.mutateAsync({ id, input }).then(() => {}),
    [updateMutation],
  )

  const deleteSleepEntry = useCallback(
    (id: string) => deleteMutation.mutateAsync(id).then(() => {}),
    [deleteMutation],
  )

  const checkSleepWell = useCallback(
    (date: string): boolean | null => didSleepWell(entries, date),
    [entries],
  )

  return {
    entries,
    isReady,
    weeklyStats,
    saveSleepEntry,
    updateSleepEntry,
    deleteSleepEntry,
    didSleepWell: checkSleepWell,
  }
}
