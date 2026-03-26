import { useState, useEffect, useCallback, useRef } from 'react'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'

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
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] }
}
const lsSet = (d: BodyMeasurement[]) => localStorage.setItem(LS_KEY, JSON.stringify(d))

interface UseBodyMeasurementsReturn {
  measurements: BodyMeasurement[]
  isReady: boolean
  saveMeasurement: (m: Omit<BodyMeasurement, 'id'>) => Promise<void>
  deleteMeasurement: (id: string) => Promise<void>
}

export const useBodyMeasurements = (userId: string | null = null): UseBodyMeasurementsReturn => {
  const [measurements, setMeasurements] = useState<BodyMeasurement[]>([])
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
          const res = await pb.collection('body_measurements').getList(1, 200, {
            filter: pb.filter('user = {:uid}', { uid: userId }),
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
          setMeasurements(entries)
          lsSet(entries)
        } catch {
          setMeasurements(lsGet())
        }
      } else {
        setMeasurements(lsGet())
      }
      setIsReady(true)
    }
    init()
  }, [userId])

  const saveMeasurement = useCallback(async (m: Omit<BodyMeasurement, 'id'>) => {
    const entry: BodyMeasurement = { ...m, id: `local_${Date.now()}` }

    if (usePB && userId) {
      try {
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
      } catch (e) { console.warn('PB measurement error:', e) }
    }

    setMeasurements(prev => {
      const updated = [entry, ...prev].sort((a, b) => b.date.localeCompare(a.date))
      lsSet(updated)
      return updated
    })
  }, [usePB, userId])

  const deleteMeasurement = useCallback(async (id: string) => {
    if (usePB && !id.startsWith('local_')) {
      try { await pb.collection('body_measurements').delete(id) } catch {}
    }
    setMeasurements(prev => {
      const updated = prev.filter(m => m.id !== id)
      lsSet(updated)
      return updated
    })
  }, [usePB])

  return { measurements, isReady, saveMeasurement, deleteMeasurement }
}
