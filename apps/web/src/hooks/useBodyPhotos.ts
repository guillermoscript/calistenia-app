import { useState, useEffect, useCallback, useRef } from 'react'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'

export interface BodyPhoto {
  id: string
  url: string
  date: string
  category: string
  note: string
  phase?: number
}

interface UseBodyPhotosReturn {
  photos: BodyPhoto[]
  isReady: boolean
  uploadPhoto: (file: File, date: string, category: string, note?: string, phase?: number) => Promise<void>
  uploadPhotos: (files: { file: File; category: string }[], phase: number, date?: string) => Promise<BodyPhoto[]>
  getPhotos: (limit?: number) => BodyPhoto[]
  getPhotosByPhase: (phase: number) => BodyPhoto[]
  deletePhoto: (id: string) => Promise<void>
}

export function useBodyPhotos(userId: string | null = null): UseBodyPhotosReturn {
  const [photos, setPhotos] = useState<BodyPhoto[]>([])
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
          const res = await pb.collection('body_photos').getList(1, 200, {
            filter: pb.filter('user = {:uid}', { uid: userId }),
            sort: '-date',
          })
          const entries: BodyPhoto[] = res.items.map((r: any) => ({
            id: r.id,
            url: pb.files.getURL(r, r.photo),
            date: r.date?.split(' ')[0] || r.date,
            category: r.category || '',
            note: r.note || '',
            phase: r.phase || undefined,
          }))
          setPhotos(entries)
        } catch (e) {
          console.warn('PB body_photos load error', e)
        }
      }
      setIsReady(true)
    }
    init()
  }, [userId])

  const uploadPhoto = useCallback(async (file: File, date: string, category: string, note?: string, phase?: number) => {
    if (!usePB || !userId) {
      console.warn('Body photos require PocketBase')
      return
    }

    try {
      const formData = new FormData()
      formData.append('user', userId)
      formData.append('photo', file)
      formData.append('date', date + ' 00:00:00')
      formData.append('category', category)
      formData.append('note', note || '')
      if (phase) formData.append('phase', String(phase))

      const rec = await pb.collection('body_photos').create(formData)
      const entry: BodyPhoto = {
        id: rec.id,
        url: pb.files.getURL(rec, (rec as any).photo),
        date,
        category,
        note: note || '',
        phase: phase || undefined,
      }

      setPhotos(prev => [entry, ...prev].sort((a, b) => b.date.localeCompare(a.date)))
    } catch (e) {
      console.warn('PB body photo upload error:', e)
    }
  }, [usePB, userId])

  const uploadPhotos = useCallback(async (files: { file: File; category: string }[], phase: number, date?: string): Promise<BodyPhoto[]> => {
    if (!usePB || !userId) {
      console.warn('Body photos require PocketBase')
      return []
    }
    const d = date || new Date().toISOString().split('T')[0]
    const uploaded: BodyPhoto[] = []
    for (const { file, category } of files) {
      try {
        const formData = new FormData()
        formData.append('user', userId)
        formData.append('photo', file)
        formData.append('date', d + ' 00:00:00')
        formData.append('category', category)
        formData.append('note', '')
        formData.append('phase', String(phase))
        const rec = await pb.collection('body_photos').create(formData)
        uploaded.push({
          id: rec.id,
          url: pb.files.getURL(rec, (rec as any).photo),
          date: d,
          category,
          note: '',
          phase,
        })
      } catch (e) {
        console.warn('PB body photo batch upload error:', e)
      }
    }
    if (uploaded.length > 0) {
      setPhotos(prev => [...uploaded, ...prev].sort((a, b) => b.date.localeCompare(a.date)))
    }
    return uploaded
  }, [usePB, userId])

  const deletePhoto = useCallback(async (id: string) => {
    if (!usePB || !userId) return

    try {
      await pb.collection('body_photos').delete(id)
      setPhotos(prev => prev.filter(p => p.id !== id))
    } catch (e) {
      console.warn('PB body photo delete error:', e)
    }
  }, [usePB, userId])

  const getPhotos = useCallback((limit: number = 100): BodyPhoto[] => {
    return photos.slice(0, limit)
  }, [photos])

  const getPhotosByPhase = useCallback((phase: number): BodyPhoto[] => {
    return photos.filter(p => p.phase === phase)
  }, [photos])

  return { photos, isReady, uploadPhoto, uploadPhotos, getPhotos, getPhotosByPhase, deletePhoto }
}
