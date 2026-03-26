import { useState, useEffect, useCallback, useRef } from 'react'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { todayStr } from '../lib/dateUtils'

const LS_KEY = 'calistenia_weight_entries'

export interface WeightEntry {
  id: string
  weight_kg: number
  date: string
  note: string
}

const lsGet = (): WeightEntry[] => {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] }
}
const lsSet = (d: WeightEntry[]): void => {
  localStorage.setItem(LS_KEY, JSON.stringify(d))
}

interface UseWeightReturn {
  weights: WeightEntry[]
  isReady: boolean
  logWeight: (weightKg: number, date?: string, note?: string) => Promise<void>
  getWeightHistory: (limit?: number) => WeightEntry[]
  deleteWeight: (id: string) => Promise<void>
}

export const useWeight = (userId: string | null = null): UseWeightReturn => {
  const [weights, setWeights] = useState<WeightEntry[]>([])
  const [isReady, setIsReady] = useState(false)
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
          const res = await pb.collection('weight_entries').getList(1, 500, {
            filter: pb.filter('user = {:uid}', { uid: userId }),
            sort: '-date',
          })
          const entries: WeightEntry[] = res.items.map((r: any) => ({
            id: r.id,
            weight_kg: r.weight_kg,
            date: r.date?.split(' ')[0] || r.date,
            note: r.note || '',
          }))
          setWeights(entries)
          lsSet(entries)
        } catch (e) {
          console.warn('PB weight_entries load error, using localStorage', e)
          setWeights(lsGet())
        }
      } else {
        setWeights(lsGet())
      }
      setIsReady(true)
    }
    init()
  }, [userId])

  const logWeight = useCallback(async (weightKg: number, date?: string, note?: string) => {
    const d = date || todayStr()
    const entry: WeightEntry = {
      id: `local_${Date.now()}`,
      weight_kg: weightKg,
      date: d,
      note: note || '',
    }

    if (usePB && userId) {
      try {
        const rec = await pb.collection('weight_entries').create({
          user: userId,
          weight_kg: weightKg,
          date: d + ' 00:00:00',
          note: note || '',
        })
        entry.id = rec.id
      } catch (e) {
        console.warn('PB weight create error:', e)
      }
    }

    setWeights(prev => {
      const updated = [entry, ...prev].sort((a, b) => b.date.localeCompare(a.date))
      lsSet(updated)
      return updated
    })
  }, [usePB, userId])

  const deleteWeight = useCallback(async (id: string) => {
    if (usePB && userId && !id.startsWith('local_')) {
      try {
        await pb.collection('weight_entries').delete(id)
      } catch (e) {
        console.warn('PB weight delete error:', e)
      }
    }

    setWeights(prev => {
      const updated = prev.filter(w => w.id !== id)
      lsSet(updated)
      return updated
    })
  }, [usePB, userId])

  const getWeightHistory = useCallback((limit: number = 100): WeightEntry[] => {
    return weights.slice(0, limit)
  }, [weights])

  return { weights, isReady, logWeight, getWeightHistory, deleteWeight }
}
