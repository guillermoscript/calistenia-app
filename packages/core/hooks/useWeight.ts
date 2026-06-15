import { storage } from '../platform'
import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'
import { todayStr } from '../lib/dateUtils'

const LS_KEY = 'calistenia_weight_entries'

export interface WeightEntry {
  id: string
  weight_kg: number
  date: string
  note: string
}

// ── localStorage helpers ──────────────────────────────────────────────────────

const lsGet = (): WeightEntry[] => {
  try { return JSON.parse(storage.getItem(LS_KEY) || '[]') } catch { return [] }
}
const lsSet = (d: WeightEntry[]): void => {
  try { storage.setItem(LS_KEY, JSON.stringify(d)) } catch { /* storage lleno */ }
}

interface UseWeightReturn {
  weights: WeightEntry[]
  isReady: boolean
  logWeight: (weightKg: number, date?: string, note?: string) => Promise<void>
  getWeightHistory: (limit?: number) => WeightEntry[]
  deleteWeight: (id: string) => Promise<void>
}

/**
 * Historial de peso corporal. Offline-first: localStorage es la fuente
 * inmediata (initialData), PocketBase es autoritativo y sobreescribe al cargar.
 * Las mutaciones son optimistas y escriben a local en onMutate; PB se
 * sincroniza en segundo plano. Forma pública estable idéntica al hook previo:
 * { weights, isReady, logWeight, getWeightHistory, deleteWeight }.
 */
export function useWeight(userId: string | null = null): UseWeightReturn {
  const qc = useQueryClient()
  const key = qk.weight(userId)

  // ── Query principal ───────────────────────────────────────────────────────

  const { data: weights = [], isSuccess } = useQuery<WeightEntry[]>({
    queryKey: key,
    // initialData = local → disponible aun offline / sin sesión.
    initialData: lsGet,
    initialDataUpdatedAt: 0, // fuerza refetch al montar para fusionar con PB
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await pb.collection('weight_entries').getList(1, 500, {
        filter: pb.filter('user = {:uid}', { uid: userId! }),
        sort: '-date',
      })
      const entries: WeightEntry[] = res.items.map((r: any) => ({
        id: r.id,
        weight_kg: r.weight_kg,
        date: r.date?.split(' ')[0] || r.date,
        note: r.note || '',
      }))
      // Escribe PB→local para que la próxima carga offline arranque fresco.
      lsSet(entries)
      return entries
    },
  })

  // isReady: true en cuanto hay datos (local o PB). Sin userId usamos el local
  // directamente, así que siempre está listo.
  const isReady = !userId ? true : isSuccess || weights.length > 0

  // ── Mutación: logWeight ───────────────────────────────────────────────────

  const logMutation = useMutation<WeightEntry, Error, { weightKg: number; date: string; note: string }>({
    mutationFn: async ({ weightKg, date, note }) => {
      // Optimismo ya aplicado; intentamos persistir en PB.
      if (!userId) throw new Error('sin sesión')
      const rec = await pb.collection('weight_entries').create({
        user: userId,
        weight_kg: weightKg,
        date: date + ' 00:00:00',
        note: note || '',
      })
      return {
        id: rec.id,
        weight_kg: weightKg,
        date,
        note: note || '',
      }
    },
    onMutate: async ({ weightKg, date, note }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<WeightEntry[]>(key) ?? lsGet()

      // Entrada optimista con id local_ mientras PB no confirma.
      const optimistic: WeightEntry = {
        id: `local_${Date.now()}`,
        weight_kg: weightKg,
        date,
        note: note || '',
      }
      const next = [optimistic, ...prev].sort((a, b) => b.date.localeCompare(a.date))
      lsSet(next)
      qc.setQueryData(key, next)
      return { prev, optimistic }
    },
    onSuccess: (confirmed, _, ctx: any) => {
      // Reemplaza el id local_ por el id real de PB.
      const current = qc.getQueryData<WeightEntry[]>(key) ?? []
      const next = current.map(w =>
        w.id === ctx?.optimistic?.id ? confirmed : w,
      )
      lsSet(next)
      qc.setQueryData(key, next)
    },
    onError: (_err, _vars, ctx: any) => {
      // Revierte al estado previo si PB falla (ej. offline sin userId).
      if (ctx?.prev) {
        lsSet(ctx.prev)
        qc.setQueryData(key, ctx.prev)
      }
    },
  })

  // ── Mutación: deleteWeight ────────────────────────────────────────────────

  const deleteMutation = useMutation<void, Error, string>({
    mutationFn: async (id) => {
      // Los ids local_ nunca llegaron a PB; solo los que tienen id real.
      if (!userId || id.startsWith('local_')) return
      await pb.collection('weight_entries').delete(id)
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<WeightEntry[]>(key) ?? lsGet()
      const next = prev.filter(w => w.id !== id)
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

  const logWeight = useCallback(
    async (weightKg: number, date?: string, note?: string) => {
      const d = date || todayStr()
      if (userId) {
        await logMutation.mutateAsync({ weightKg, date: d, note: note || '' }).catch(() => {
          // Error ya gestionado en onError; entrada optimista persiste offline.
        })
      } else {
        // Sin sesión: solo local, sin pasar por mutationFn.
        const entry: WeightEntry = {
          id: `local_${Date.now()}`,
          weight_kg: weightKg,
          date: d,
          note: note || '',
        }
        qc.setQueryData<WeightEntry[]>(key, (prev = []) => {
          const next = [entry, ...prev].sort((a, b) => b.date.localeCompare(a.date))
          lsSet(next)
          return next
        })
      }
    },
    [userId, logMutation, qc, key],
  )

  const deleteWeight = useCallback(
    async (id: string) => {
      await deleteMutation.mutateAsync(id).catch(() => {})
    },
    [deleteMutation],
  )

  // getWeightHistory(n): selector sobre query.data — firma idéntica al hook previo.
  const getWeightHistory = useCallback(
    (limit: number = 100): WeightEntry[] => weights.slice(0, limit),
    [weights],
  )

  return { weights, isReady, logWeight, getWeightHistory, deleteWeight }
}
