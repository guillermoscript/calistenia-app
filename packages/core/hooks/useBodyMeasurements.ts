import { storage } from '../platform'
import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'
import { makeOptimisticListHandlers } from '../lib/optimistic'

const LS_KEY = 'calistenia_body_measurements'

export interface BodyMeasurement {
  id: string
  date: string
  chest?: number
  waist?: number
  hips?: number
  arm_left?: number
  arm_right?: number
  thigh_left?: number
  thigh_right?: number
  note: string
}

const lsGet = (): BodyMeasurement[] => {
  try { return JSON.parse(storage.getItem(LS_KEY) || '[]') } catch { return [] }
}
const lsSet = (d: BodyMeasurement[]) => storage.setItem(LS_KEY, JSON.stringify(d))

const sortByDate = (a: BodyMeasurement, b: BodyMeasurement) => b.date.localeCompare(a.date)

interface UseBodyMeasurementsReturn {
  measurements: BodyMeasurement[]
  isReady: boolean
  saveMeasurement: (m: Omit<BodyMeasurement, 'id'>) => Promise<void>
  deleteMeasurement: (id: string) => Promise<void>
}

/**
 * Medidas corporales. Offline-first: localStorage es la fuente inmediata
 * (initialData), PocketBase autoritativo al cargar. Mutaciones optimistas con
 * write-through a local y guard de id `local_`. Forma pública estable:
 * { measurements, isReady, saveMeasurement, deleteMeasurement }.
 */
export function useBodyMeasurements(userId: string | null = null): UseBodyMeasurementsReturn {
  const qc = useQueryClient()
  const key = qk.bodyMeasurements(userId)

  const query = useQuery({
    queryKey: key,
    initialData: lsGet,
    initialDataUpdatedAt: 0, // fuerza refetch al montar para fusionar con PB
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<BodyMeasurement[]> => {
      const res = await pb.collection('body_measurements').getList(1, 200, {
        filter: pb.filter('user = {:uid}', { uid: userId! }),
        sort: '-date',
      })
      const entries: BodyMeasurement[] = res.items.map((r: any) => ({
        id: r.id,
        date: r.date?.split(' ')[0] || r.date,
        chest: r.chest || undefined,
        waist: r.waist || undefined,
        hips: r.hips || undefined,
        arm_left: r.arm_left || undefined,
        arm_right: r.arm_right || undefined,
        thigh_left: r.thigh_left || undefined,
        thigh_right: r.thigh_right || undefined,
        note: r.note || '',
      }))
      lsSet(entries)
      return entries
    },
  })

  const saveMutation = useMutation<BodyMeasurement, Error, Omit<BodyMeasurement, 'id'>, { prev?: BodyMeasurement[]; optimisticId: string }>({
    mutationFn: async (m) => {
      const entry: BodyMeasurement = { ...m, id: `local_${Date.now()}` }
      if (userId) {
        const rec = await pb.collection('body_measurements').create({
          user: userId,
          date: m.date + ' 00:00:00',
          chest: m.chest || null,
          waist: m.waist || null,
          hips: m.hips || null,
          arm_left: m.arm_left || null,
          arm_right: m.arm_right || null,
          thigh_left: m.thigh_left || null,
          thigh_right: m.thigh_right || null,
          note: m.note || '',
        })
        entry.id = rec.id
      }
      return entry
    },
    onMutate: async (m) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<BodyMeasurement[]>(key) ?? lsGet()
      const optimisticId = `local_${Date.now()}`
      const optimistic: BodyMeasurement = { ...m, id: optimisticId }
      const next = [optimistic, ...prev].sort(sortByDate)
      lsSet(next)
      qc.setQueryData(key, next)
      return { prev, optimisticId }
    },
    onSuccess: (confirmed, _m, ctx) => {
      // Reemplaza la entrada optimista por la confirmada (id real de PB).
      const cur = qc.getQueryData<BodyMeasurement[]>(key) ?? []
      const next = cur.map((e) => (e.id === ctx.optimisticId ? confirmed : e)).sort(sortByDate)
      lsSet(next)
      qc.setQueryData(key, next)
    },
    onError: (_e, _m, ctx) => {
      if (ctx?.prev) { lsSet(ctx.prev); qc.setQueryData(key, ctx.prev) }
    },
  })

  // Handlers generados por el helper: onMutate captura resolvedKey para rollback seguro.
  // NOTA: saveMutation NO usa el helper porque su onSuccess necesita ctx.optimisticId (swap de id).
  const deleteHandlers = makeOptimisticListHandlers<BodyMeasurement[], string>(
    qc,
    () => key,
    lsGet,
    (prev, id) => prev.filter((m) => m.id !== id),
    lsSet,
  )

  const deleteMutation = useMutation<void, Error, string>({
    mutationFn: async (id) => {
      if (userId && !id.startsWith('local_')) {
        await pb.collection('body_measurements').delete(id).catch(() => {})
      }
    },
    ...deleteHandlers,
  })

  const saveMeasurement = useCallback(
    (m: Omit<BodyMeasurement, 'id'>) => saveMutation.mutateAsync(m).then(() => {}).catch(() => {}),
    [saveMutation],
  )
  const deleteMeasurement = useCallback(
    (id: string) => deleteMutation.mutateAsync(id).catch(() => {}),
    [deleteMutation],
  )

  return {
    measurements: query.data ?? [],
    isReady: !userId || query.isFetched,
    saveMeasurement,
    deleteMeasurement,
  }
}
