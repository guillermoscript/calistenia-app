import { storage } from '../platform'
import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { op } from '../lib/analytics'
import { todayStr, addDays, localMidnightAsUTC, nowLocalForPB } from '../lib/dateUtils'
import { qk } from '../lib/query-keys'
import { makeOptimisticListHandlers } from '../lib/optimistic'

const LS_KEY = 'calistenia_water'
const DEFAULT_GOAL = 2500 // ml

export interface WaterEntry {
  id?: string
  amount_ml: number
  logged_at: string
}

interface DayWater {
  entries: WaterEntry[]
  total: number
}

interface UseWaterReturn {
  dayTotal: number
  dayEntries: WaterEntry[]
  /** @deprecated use dayTotal */
  todayTotal: number
  /** @deprecated use dayEntries */
  todayEntries: WaterEntry[]
  goal: number
  setGoal: (ml: number) => void
  addWater: (ml: number) => Promise<void>
  removeEntry: (id: string) => Promise<void>
  isReady: boolean
  adding: boolean
}

// — Helpers de localStorage para datos por día —
const lsGet = (): Record<string, DayWater> => {
  try { return JSON.parse(storage.getItem(LS_KEY) || '{}') } catch { return {} }
}
const lsSet = (d: Record<string, DayWater>) => storage.setItem(LS_KEY, JSON.stringify(d))
const lsGetGoal = (): number => {
  try { return Number(storage.getItem('calistenia_water_goal')) || DEFAULT_GOAL } catch { return DEFAULT_GOAL }
}
const lsSetGoal = (ml: number) => storage.setItem('calistenia_water_goal', String(ml))

// Helper: extrae DayWater para una fecha desde el mapa de localStorage
const lsGetDay = (date: string): DayWater =>
  lsGet()[date] ?? { entries: [], total: 0 }

// Helper: sobreescribe una fecha en el mapa de localStorage
const lsSetDay = (date: string, day: DayWater) => {
  const all = lsGet()
  all[date] = day
  lsSet(all)
}

/**
 * Agua diaria. Offline-first con keying por fecha: cada día tiene su propia
 * query (qk.water.day) y la meta su propia query (qk.water.goal).
 * addWater/removeEntry/setGoal son mutaciones optimistas con write-through a
 * localStorage en onMutate y rollback en onError.
 * Forma pública estable: UseWaterReturn (incluyendo aliases deprecados).
 */
export function useWater(userId: string | null = null, selectedDate?: string): UseWaterReturn {
  const qc = useQueryClient()
  const today = todayStr()
  const activeDate = selectedDate || today

  const dayKey = qk.water.day(userId, activeDate)
  const goalKey = qk.water.goal(userId)

  // — Query: entradas del día activo —
  const { data: dayData, isFetched: dayFetched } = useQuery<DayWater>({
    queryKey: dayKey,
    // initialData desde localStorage → disponible aun offline
    initialData: () => lsGetDay(activeDate),
    initialDataUpdatedAt: 0, // fuerza refetch al montar para fusionar con PB
    enabled: !!userId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const dayStart = localMidnightAsUTC(activeDate)
      const dayEnd = localMidnightAsUTC(addDays(activeDate, 1))
      const res = await pb.collection('water_entries').getList(1, 100, {
        filter: pb.filter(
          'user = {:uid} && logged_at >= {:start} && logged_at < {:end}',
          { uid: userId!, start: dayStart, end: dayEnd },
        ),
        sort: '-logged_at',
        $autoCancel: false,
      })
      const entries: WaterEntry[] = res.items.map((r: any) => ({
        id: r.id,
        amount_ml: Number(r.amount_ml) || 0,
        logged_at: r.logged_at || r.created,
      }))
      const total = entries.reduce((s, e) => s + e.amount_ml, 0)
      const day: DayWater = { entries, total }
      // Write-through a localStorage para caché offline actualizado
      lsSetDay(activeDate, day)
      return day
    },
  })

  // — Query: meta de agua —
  const { data: goal = DEFAULT_GOAL, isFetched: goalFetched } = useQuery<number>({
    queryKey: goalKey,
    // initialData desde localStorage → disponible aun offline
    initialData: lsGetGoal,
    initialDataUpdatedAt: 0,
    enabled: !!userId,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const settingsRes = await pb.collection('settings').getList(1, 1, {
        filter: pb.filter('user = {:uid}', { uid: userId! }),
        $autoCancel: false,
      })
      const settingsRec = settingsRes.items[0] || null
      if (settingsRec && (settingsRec as any).water_goal) {
        const pbGoal = (settingsRec as any).water_goal as number
        lsSetGoal(pbGoal)
        return pbGoal
      }
      return lsGetGoal()
    },
  })

  const currentDay: DayWater = dayData ?? { entries: [], total: 0 }
  const isReady = !userId ? true : (dayFetched || currentDay.entries.length > 0) && goalFetched

  // — Mutación: agregar entrada de agua (optimista) —
  const addMutation = useMutation({
    mutationFn: async (ml: number) => {
      if (!userId) return null
      const rec = await pb.collection('water_entries').create({
        user: userId,
        amount_ml: ml,
      })
      return rec
    },
    onMutate: async (ml: number) => {
      await qc.cancelQueries({ queryKey: dayKey })
      const prev = qc.getQueryData<DayWater>(dayKey) ?? lsGetDay(activeDate)
      // Guardia local_: id temporal hasta confirmar con PB
      const localId = `local_${Date.now()}`
      const entry: WaterEntry = { id: localId, amount_ml: ml, logged_at: nowLocalForPB() }
      const next: DayWater = {
        entries: [entry, ...prev.entries],
        total: prev.total + ml,
      }
      lsSetDay(activeDate, next)
      qc.setQueryData(dayKey, next)
      op.track('water_logged', { amount_ml: ml })
      return { prev, localId }
    },
    onError: (_err, _ml, ctx) => {
      if (ctx?.prev) {
        lsSetDay(activeDate, ctx.prev)
        qc.setQueryData(dayKey, ctx.prev)
      }
    },
    onSuccess: (rec, _ml, ctx) => {
      if (!rec || !ctx) return
      // Reemplazar el id local_ con el id real de PB
      qc.setQueryData(dayKey, (old: DayWater = { entries: [], total: 0 }) => {
        const entries = old.entries.map(e =>
          e.id === ctx.localId ? { ...e, id: rec.id } : e
        )
        const updated: DayWater = { ...old, entries }
        lsSetDay(activeDate, updated)
        return updated
      })
    },
  })

  // — Mutación: eliminar entrada de agua (optimista) —
  // Handlers generados por el helper: onMutate captura resolvedKey para rollback seguro.
  // NOTA: addMutation NO usa el helper porque su onSuccess necesita ctx.localId (swap de id optimista).
  const removeHandlers = makeOptimisticListHandlers<DayWater, string>(
    qc,
    () => dayKey,
    () => lsGetDay(activeDate),
    (prev, id) => {
      const removedEntry = prev.entries.find(e => e.id === id)
      return {
        entries: prev.entries.filter(e => e.id !== id),
        total: prev.total - (removedEntry?.amount_ml || 0),
      }
    },
    (next) => lsSetDay(activeDate, next),
  )

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      // Guardia local_: no borrar en PB si es id temporal
      if (!userId || id.startsWith('local_')) return
      await pb.collection('water_entries').delete(id)
    },
    ...removeHandlers,
  })

  // — Mutación: actualizar meta de agua (optimista) —
  // Handlers generados por el helper: T = number (valor escalar), key diferente goalKey.
  const goalHandlers = makeOptimisticListHandlers<number, number>(
    qc,
    () => goalKey,
    lsGetGoal,
    (_prev, ml) => ml,
    lsSetGoal,
  )

  const goalMutation = useMutation({
    mutationFn: async (ml: number) => {
      if (!userId) return
      const existingRes = await pb.collection('settings').getList(1, 1, {
        filter: pb.filter('user = {:uid}', { uid: userId }),
        $autoCancel: false,
      })
      if (existingRes.items.length > 0) {
        await pb.collection('settings').update(existingRes.items[0].id, { water_goal: ml })
      } else {
        await pb.collection('settings').create({ user: userId, water_goal: ml })
      }
    },
    ...goalHandlers,
  })

  // — Wrappers de API pública (misma forma que el hook original) —
  // .catch silencioso: onError ya revierte el optimista y la cola offline
  // reintenta; sin esto, un fallo (p.ej. offline) queda como unhandled rejection.
  const addWater = useCallback(
    (ml: number) => addMutation.mutateAsync(ml).then(() => {}).catch(() => {}),
    [addMutation],
  )

  const removeEntry = useCallback(
    (id: string) => removeMutation.mutateAsync(id).then(() => {}).catch(() => {}),
    [removeMutation],
  )

  const setGoal = useCallback(
    (ml: number) => { goalMutation.mutate(ml) },
    [goalMutation],
  )

  return {
    dayTotal: currentDay.total,
    dayEntries: currentDay.entries,
    todayTotal: currentDay.total,    // @deprecated: alias de dayTotal
    todayEntries: currentDay.entries, // @deprecated: alias de dayEntries
    goal,
    setGoal,
    addWater,
    removeEntry,
    isReady,
    // Offline RQ pausa la mutación pero `isPending` sigue true → el spinner del
    // botón quedaría colgado para siempre. `!isPaused` la trata como resuelta:
    // la escritura está encolada y el update optimista ya refleja el cambio.
    adding: addMutation.isPending && !addMutation.isPaused,
  }
}
