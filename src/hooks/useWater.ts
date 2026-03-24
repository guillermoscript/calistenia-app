import { useState, useEffect, useCallback, useRef } from 'react'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { todayStr, localMidnightAsUTC } from '../lib/dateUtils'

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
  todayTotal: number
  todayEntries: WaterEntry[]
  goal: number
  setGoal: (ml: number) => void
  addWater: (ml: number) => Promise<void>
  removeEntry: (id: string) => Promise<void>
  isReady: boolean
}

// localStorage helpers
const lsGet = (): Record<string, DayWater> => {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') } catch { return {} }
}
const lsSet = (d: Record<string, DayWater>) => localStorage.setItem(LS_KEY, JSON.stringify(d))
const lsGetGoal = (): number => {
  try { return Number(localStorage.getItem('calistenia_water_goal')) || DEFAULT_GOAL } catch { return DEFAULT_GOAL }
}

export const useWater = (userId: string | null = null): UseWaterReturn => {
  const [data, setData] = useState<Record<string, DayWater>>({})
  const [goal, setGoalState] = useState(lsGetGoal)
  const [usePB, setUsePB] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const initialized = useRef(false)

  const today = todayStr()

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
            amount_ml: r.amount_ml,
            logged_at: r.logged_at || r.created,
          }))
          const total = entries.reduce((s, e) => s + e.amount_ml, 0)
          setData({ [today]: { entries, total } })
          // Load water goal from PB settings
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

  const todayData = data[today] || { entries: [], total: 0 }

  const addWater = useCallback(async (ml: number) => {
    const entry: WaterEntry = { id: `local_${Date.now()}`, amount_ml: ml, logged_at: new Date().toISOString() }

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
        // Update the local entry with real id
        setData(prev => {
          const day = prev[today]
          if (!day) return prev
          const entries = day.entries.map(e => e.id === entry.id ? { ...e, id: rec.id } : e)
          const updated = { ...prev, [today]: { ...day, entries } }
          lsSet(updated)
          return updated
        })
      } catch (e) { console.warn('PB water error:', e) }
    }
  }, [usePB, userId, today])

  const removeEntry = useCallback(async (id: string) => {
    setData(prev => {
      const day = prev[today]
      if (!day) return prev
      const entry = day.entries.find(e => e.id === id)
      const entries = day.entries.filter(e => e.id !== id)
      const updated = { ...prev, [today]: { entries, total: day.total - (entry?.amount_ml || 0) } }
      lsSet(updated)
      return updated
    })

    if (usePB && userId && !id.startsWith('local_')) {
      try { await pb.collection('water_entries').delete(id) } catch {}
    }
  }, [usePB, userId, today])

  const setGoal = useCallback(async (ml: number) => {
    setGoalState(ml)
    localStorage.setItem('calistenia_water_goal', String(ml))

    // Persist to PB settings
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
    todayTotal: todayData.total,
    todayEntries: todayData.entries,
    goal,
    setGoal,
    addWater,
    removeEntry,
    isReady,
  }
}
