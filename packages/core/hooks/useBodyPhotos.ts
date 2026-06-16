import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'

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
  const qc = useQueryClient()
  const key = qk.bodyPhotos(userId)

  // ─── Query principal: carga todas las fotos del usuario desde PocketBase ───
  const { data: photos = [], isLoading, isSuccess, isError } = useQuery<BodyPhoto[]>({
    queryKey: key,
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // Verificar disponibilidad de PocketBase antes de intentar la carga
      const available = await isPocketBaseAvailable()
      if (!available || !userId) return []

      const res = await pb.collection('body_photos').getList(1, 200, {
        filter: pb.filter('user = {:uid}', { uid: userId }),
        sort: '-date',
      })
      return res.items.map((r: any): BodyPhoto => ({
        id: r.id,
        url: pb.files.getURL(r, r.photo),
        date: r.date?.split(' ')[0] || r.date,
        category: r.category || '',
        note: r.note || '',
        phase: r.phase || undefined,
      }))
    },
  })

  // isReady es true en cuanto la query resuelve (éxito o error), igual que el
  // comportamiento original donde setIsReady(true) se llamaba en el bloque final.
  const isReady = !userId ? true : (!isLoading || isSuccess || isError)

  // ─── Mutación: subir una foto individual ───
  const uploadPhotoMutation = useMutation({
    mutationFn: async ({
      file, date, category, note, phase,
    }: { file: File; date: string; category: string; note?: string; phase?: number }) => {
      if (!userId) {
        console.warn('Body photos require PocketBase')
        return
      }
      const formData = new FormData()
      formData.append('user', userId)
      formData.append('photo', file)
      formData.append('date', date + ' 00:00:00')
      formData.append('category', category)
      formData.append('note', note || '')
      if (phase) formData.append('phase', String(phase))

      const rec = await pb.collection('body_photos').create(formData)
      // Resolver URL del archivo recién creado
      return {
        id: rec.id,
        url: pb.files.getURL(rec, (rec as any).photo),
        date,
        category,
        note: note || '',
        phase: phase || undefined,
      } as BodyPhoto
    },
    onSettled: () => {
      // Invalidar cache para reflejar la foto nueva
      qc.invalidateQueries({ queryKey: key })
    },
    onError: (e) => {
      console.warn('PB body photo upload error:', e)
    },
  })

  // ─── Mutación: subir múltiples fotos de forma secuencial ───
  const uploadPhotosMutation = useMutation({
    mutationFn: async ({
      files, phase, date,
    }: { files: { file: File; category: string }[]; phase: number; date?: string }): Promise<BodyPhoto[]> => {
      if (!userId) {
        console.warn('Body photos require PocketBase')
        return []
      }
      const d = date || new Date().toISOString().split('T')[0]
      const uploaded: BodyPhoto[] = []

      // Upload secuencial — preserva el orden original de las fotos
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
      return uploaded
    },
    onSettled: () => {
      // Invalidar cache tras el batch para sincronizar todas las fotos nuevas
      qc.invalidateQueries({ queryKey: key })
    },
  })

  // ─── Mutación: eliminar una foto ───
  const deletePhotoMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!userId) return
      await pb.collection('body_photos').delete(id)
    },
    onSettled: () => {
      // Invalidar cache para eliminar la foto de la lista
      qc.invalidateQueries({ queryKey: key })
    },
    onError: (e) => {
      console.warn('PB body photo delete error:', e)
    },
  })

  // ─── Wrappers públicos — forma idéntica al hook original ───

  const uploadPhoto = useCallback(
    async (file: File, date: string, category: string, note?: string, phase?: number): Promise<void> => {
      await uploadPhotoMutation.mutateAsync({ file, date, category, note, phase }).catch(() => {})
    },
    [uploadPhotoMutation],
  )

  const uploadPhotos = useCallback(
    async (files: { file: File; category: string }[], phase: number, date?: string): Promise<BodyPhoto[]> => {
      return uploadPhotosMutation.mutateAsync({ files, phase, date }).catch(() => [])
    },
    [uploadPhotosMutation],
  )

  const deletePhoto = useCallback(
    async (id: string): Promise<void> => {
      await deletePhotoMutation.mutateAsync(id).catch(() => {})
    },
    [deletePhotoMutation],
  )

  // ─── Selectores puros sobre query.data — sin fetch adicional ───

  const getPhotos = useCallback(
    (limit: number = 100): BodyPhoto[] => photos.slice(0, limit),
    [photos],
  )

  const getPhotosByPhase = useCallback(
    (phase: number): BodyPhoto[] => photos.filter(p => p.phase === phase),
    [photos],
  )

  return { photos, isReady, uploadPhoto, uploadPhotos, getPhotos, getPhotosByPhase, deletePhoto }
}
