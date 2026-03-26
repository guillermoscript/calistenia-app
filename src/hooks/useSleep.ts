import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { daysAgoStr, nowLocalForPB } from '../lib/dateUtils'
import type { SleepEntry } from '../types'

const LS_KEY = 'calistenia_sleep_entries'

const lsGet = (): SleepEntry[] => {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] }
}
const lsSet = (d: SleepEntry[]) => localStorage.setItem(LS_KEY, JSON.stringify(d))

/**
 * Calculate duration in minutes from bedtime to wake_time, handling midnight crossing.
 * Both times are "HH:MM" strings.
 */
export const calculateDurationMinutes = (bedtime: string, wakeTime: string): number => {
  const [bH, bM] = bedtime.split(':').map(Number)
  const [wH, wM] = wakeTime.split(':').map(Number)
  let bedMin = bH * 60 + bM
  let wakeMin = wH * 60 + wM
  if (wakeMin <= bedMin) {
    // midnight crossing: e.g. 23:30 -> 07:15
    wakeMin += 24 * 60
  }
  return wakeMin - bedMin
}

/**
 * Returns true if the user "slept well" on the given date (quality >= 3).
 * Returns null if no entry exists for that date.
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
  scheduleRegularity: number // std deviation of bedtime in minutes
  entryCount: number
}

const computeStats = (entries: SleepEntry[]): SleepStats => {
  if (entries.length === 0) {
    return { avgDuration: 0, avgQuality: 0, avgAwakenings: 0, scheduleRegularity: 0, entryCount: 0 }
  }

  const n = entries.length
  const avgDuration = entries.reduce((s, e) => s + e.duration_minutes, 0) / n
  const avgQuality = entries.reduce((s, e) => s + e.quality, 0) / n
  const avgAwakenings = entries.reduce((s, e) => s + e.awakenings, 0) / n

  // Schedule regularity: std deviation of bedtime (in minutes from midnight)
  const bedtimeMinutes = entries.map(e => {
    const [h, m] = e.bedtime.split(':').map(Number)
    // Normalize: times before 12:00 are "next day" (e.g. 01:00 = 25*60)
    return h < 12 ? (h + 24) * 60 + m : h * 60 + m
  })
  const meanBedtime = bedtimeMinutes.reduce((s, v) => s + v, 0) / n
  const variance = bedtimeMinutes.reduce((s, v) => s + (v - meanBedtime) ** 2, 0) / n
  const scheduleRegularity = Math.sqrt(variance)

  return {
    avgDuration: Math.round(avgDuration * 10) / 10,
    avgQuality: Math.round(avgQuality * 10) / 10,
    avgAwakenings: Math.round(avgAwakenings * 10) / 10,
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

export const useSleep = (userId: string | null = null): UseSleepReturn => {
  const [entries, setEntries] = useState<SleepEntry[]>([])
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
          const res = await pb.collection('sleep_entries').getList(1, 500, {
            filter: pb.filter('user = {:uid}', { uid: userId }),
            sort: '-date',
          })
          const items: SleepEntry[] = res.items.map((r: any) => ({
            id: r.id,
            user: r.user,
            date: r.date?.split(' ')[0] || r.date,
            bedtime: r.bedtime,
            wake_time: r.wake_time,
            awakenings: r.awakenings,
            quality: r.quality,
            duration_minutes: r.duration_minutes,
            caffeine: r.caffeine ?? undefined,
            screen_before_bed: r.screen_before_bed ?? undefined,
            stress_level: r.stress_level || undefined,
            note: r.note || undefined,
            created: r.created,
            updated: r.updated,
          }))
          setEntries(items)
          lsSet(items)
        } catch (e) {
          console.warn('PB sleep_entries load error, using localStorage', e)
          setEntries(lsGet())
        }
      } else {
        setEntries(lsGet())
      }
      setIsReady(true)
    }
    init()
  }, [userId])

  // Weekly stats: last 7 days
  const weeklyStats = useMemo(() => {
    const cutoff = daysAgoStr(7)
    const recent = entries.filter(e => e.date >= cutoff)
    return computeStats(recent)
  }, [entries])

  const saveSleepEntry = useCallback(async (input: SleepEntryInput) => {
    const duration_minutes = calculateDurationMinutes(input.bedtime, input.wake_time)
    const now = nowLocalForPB()
    const entry: SleepEntry = {
      ...input,
      id: `local_${Date.now()}`,
      user: userId || '',
      duration_minutes,
      created: now,
      updated: now,
    }

    if (usePB && userId) {
      try {
        const rec = await pb.collection('sleep_entries').create({
          user: userId,
          date: input.date + ' 00:00:00',
          bedtime: input.bedtime,
          wake_time: input.wake_time,
          awakenings: input.awakenings,
          quality: input.quality,
          duration_minutes,
          caffeine: input.caffeine ?? null,
          screen_before_bed: input.screen_before_bed ?? null,
          stress_level: input.stress_level ?? null,
          note: input.note || '',
        })
        entry.id = rec.id
        entry.created = rec.created
        entry.updated = rec.updated
      } catch (e) {
        console.warn('PB sleep create error:', e)
      }
    }

    setEntries(prev => {
      const updated = [entry, ...prev].sort((a, b) => b.date.localeCompare(a.date))
      lsSet(updated)
      return updated
    })
  }, [usePB, userId])

  const updateSleepEntry = useCallback(async (id: string, input: Partial<SleepEntryInput>) => {
    if (usePB && userId && !id.startsWith('local_')) {
      try {
        const data: Record<string, any> = { ...input }
        if (input.bedtime || input.wake_time) {
          // Need to find the existing entry to compute new duration
          const existing = entries.find(e => e.id === id)
          if (existing) {
            const bedtime = input.bedtime ?? existing.bedtime
            const wake_time = input.wake_time ?? existing.wake_time
            data.duration_minutes = calculateDurationMinutes(bedtime, wake_time)
          }
        }
        if (input.date) {
          data.date = input.date + ' 00:00:00'
        }
        await pb.collection('sleep_entries').update(id, data)
      } catch (e) {
        console.warn('PB sleep update error:', e)
      }
    }

    setEntries(prev => {
      const updated = prev.map(entry => {
        if (entry.id !== id) return entry
        const merged = { ...entry, ...input, updated: nowLocalForPB() }
        // Recalculate duration if bedtime or wake_time changed
        if (input.bedtime || input.wake_time) {
          merged.duration_minutes = calculateDurationMinutes(merged.bedtime, merged.wake_time)
        }
        return merged
      }).sort((a, b) => b.date.localeCompare(a.date))
      lsSet(updated)
      return updated
    })
  }, [usePB, userId, entries])

  const deleteSleepEntry = useCallback(async (id: string) => {
    if (usePB && !id.startsWith('local_')) {
      try { await pb.collection('sleep_entries').delete(id) } catch {}
    }
    setEntries(prev => {
      const updated = prev.filter(e => e.id !== id)
      lsSet(updated)
      return updated
    })
  }, [usePB])

  const checkSleepWell = useCallback((date: string): boolean | null => {
    return didSleepWell(entries, date)
  }, [entries])

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
