import { useState, useEffect, useCallback, useRef } from 'react'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { todayStr, addDays, localMidnightAsUTC } from '../lib/dateUtils'

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

// localStorage helpers
const lsGet = (): Record<string, DayWater> => {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') } catch { return {} }
}
const lsSet = (d: Record<string, DayWater>) => localStorage.setItem(LS_KEY, JSON.stringify(d))
const lsGetGoal = (): number => {
  try { return Number(localStorage.getItem('calistenia_water_goal')) || DEFAULT_GOAL } catch { return DEFAULT_GOAL }
}

export const useWater = (userId: string | null = null, selectedDate?: string): UseWaterReturn => {
  const [data, setData] = useState<Record<string, DayWater>>({})
  const [goal, setGoalState] = useState(lsGetGoal)
  const [usePB, setUsePB] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [adding, setAdding] = useState(false)
  const initialized = useRef(false)
  const loadedDates = useRef<Set<string>>(new Set())
  const abortRef = useRef<AbortController | null>(null)

  const today = todayStr()
  const activeDate = selectedDate || today

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    const init = async () => {
      const available = userId ? await isPocketBaseAvailable() : false
      setUsePB(available && !!userId)

      if (available && userId) {
        try {
          const startOfDay = localMidnightAsUTC(today)
          const [res, settingsRec] = await Promise.all([
            pb.collection('water_entries').getList(1, 100, {
              filter: pb.filter('user = {:uid} && logged_at >= {:start}', { uid: userId, start: startOfDay }),
              sort: '-logged_at',
            }),
            pb.collection('settings').getList(1, 1, {
              filter: pb.filter('user = {:uid}', { uid: userId }),
              $autoCancel: false,
            }).then(r => r.items[0] || null).catch(() => null),
          ])
          const entries: WaterEntry[] = res.items.map((r: any) => ({
            id: r.id,
            amount_ml: Number(r.amount_ml) || 0,
            logged_at: r.logged_at || r.created,
          }))
          const total = entries.reduce((s, e) => s + e.amount_ml, 0)
          setData({ [today]: { entries, total } })
          loadedDates.current.add(today)
          if (settingsRec && (settingsRec as any).water_goal) {
            const pbGoal = (settingsRec as any).water_goal
            setGoalState(pbGoal)
            localStorage.setItem('calistenia_water_goal', String(pbGoal))
          }
        } catch {
          setData(lsGet())
        }
      } else {
        setData(lsGet())
      }
      setIsReady(true)
    }
    init()
  }, [userId, today])

  // On-demand fetch for selected date with AbortController
  useEffect(() => {
    if (!usePB || !userId || !activeDate) return
    if (loadedDates.current.has(activeDate)) return
    loadedDates.current.add(activeDate)

    const controller = new AbortController()
    abortRef.current?.abort()
    abortRef.current = controller

    const fetchDay = async () => {
      try {
        const dayStart = localMidnightAsUTC(activeDate)
        const dayEnd = localMidnightAsUTC(addDays(activeDate, 1))
        const res = await pb.collection('water_entries').getList(1, 100, {
          filter: pb.filter('user = {:uid} && logged_at >= {:start} && logged_at < {:end}', {
            uid: userId, start: dayStart, end: dayEnd,
          }),
          sort: '-logged_at',
          $autoCancel: false,
        })
        if (controller.signal.aborted) return
        const entries: WaterEntry[] = res.items.map((r: any) => ({
          id: r.id,
          amount_ml: Number(r.amount_ml) || 0,
          logged_at: r.logged_at || r.created,
        }))
        const total = entries.reduce((s, e) => s + e.amount_ml, 0)
        setData(prev => {
          const updated = { ...prev, [activeDate]: { entries, total } }
          lsSet(updated)
          return updated
        })
      } catch {
        if (!controller.signal.aborted) {
          loadedDates.current.delete(activeDate)
        }
      }
    }
    fetchDay()

    return () => { controller.abort() }
  }, [usePB, userId, activeDate])

  const dayData = data[activeDate] || { entries: [], total: 0 }

  const addWater = useCallback(async (ml: number) => {
    if (adding) return // prevent rapid double-clicks
    setAdding(true)
    const localId = `local_${Date.now()}`
    const entry: WaterEntry = { id: localId, amount_ml: ml, logged_at: new Date().toISOString() }

    // Optimistic update
    setData(prev => {
      const day = prev[today] || { entries: [], total: 0 }
      const updated = {
        ...prev,
        [today]: { entries: [entry, ...day.entries], total: day.total + ml },
      }
      lsSet(updated)
      return updated
    })

    if (usePB && userId) {
      try {
        const rec = await pb.collection('water_entries').create({
          user: userId,
          amount_ml: ml,
        })
        // Replace local id with real id
        setData(prev => {
          const day = prev[today]
          if (!day) return prev
          const entries = day.entries.map(e => e.id === localId ? { ...e, id: rec.id } : e)
          const updated = { ...prev, [today]: { ...day, entries } }
          lsSet(updated)
          return updated
        })
      } catch {
        // Rollback optimistic update on failure
        setData(prev => {
          const day = prev[today]
          if (!day) return prev
          const entries = day.entries.filter(e => e.id !== localId)
          const updated = { ...prev, [today]: { entries, total: day.total - ml } }
          lsSet(updated)
          return updated
        })
      }
    }
    setAdding(false)
  }, [usePB, userId, today, adding])

  const removeEntry = useCallback(async (id: string) => {
    // Snapshot for rollback
    let removedEntry: WaterEntry | undefined

    setData(prev => {
      const day = prev[today]
      if (!day) return prev
      removedEntry = day.entries.find(e => e.id === id)
      const entries = day.entries.filter(e => e.id !== id)
      const updated = { ...prev, [today]: { entries, total: day.total - (removedEntry?.amount_ml || 0) } }
      lsSet(updated)
      return updated
    })

    if (usePB && userId && !id.startsWith('local_')) {
      try {
        await pb.collection('water_entries').delete(id)
      } catch {
        // Rollback: restore entry
        if (removedEntry) {
          setData(prev => {
            const day = prev[today] || { entries: [], total: 0 }
            const updated = {
              ...prev,
              [today]: { entries: [removedEntry!, ...day.entries], total: day.total + removedEntry!.amount_ml },
            }
            lsSet(updated)
            return updated
          })
        }
      }
    }
  }, [usePB, userId, today])

  const setGoal = useCallback(async (ml: number) => {
    setGoalState(ml)
    localStorage.setItem('calistenia_water_goal', String(ml))

    if (usePB && userId) {
      try {
        const existingRes = await pb.collection('settings').getList(1, 1, {
          filter: pb.filter('user = {:uid}', { uid: userId }),
          $autoCancel: false,
        })
        if (existingRes.items.length > 0) {
          await pb.collection('settings').update(existingRes.items[0].id, { water_goal: ml })
        } else {
          await pb.collection('settings').create({ user: userId, water_goal: ml })
        }
      } catch {
        // PB not available, goal saved to localStorage above
      }
    }
  }, [usePB, userId])

  return {
    dayTotal: dayData.total,
    dayEntries: dayData.entries,
    todayTotal: dayData.total,
    todayEntries: dayData.entries,
    goal,
    setGoal,
    addWater,
    removeEntry,
    isReady,
    adding,
  }
}
