import { useState, useCallback } from 'react'
import i18n from 'i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { searchWger, getWgerExerciseInfo, downloadWgerImage } from '../lib/wger'
import { mapWgerToExerciseCatalog } from '../lib/wger-mappings'
import type { WgerSearchSuggestion } from '../lib/wger'

// TODO: mover a qk — key para búsquedas en la API externa de wger (ejercicios)
const wgerSearchKey = (term: string, language: string) =>
  ['wger', 'search', term, language] as const

export function useWgerSearch() {
  // Término activo que dispara la query; cadena vacía deshabilita la búsqueda
  const [searchTerm, setSearchTerm] = useState('')
  const [searchLanguage, setSearchLanguage] = useState('es')
  const [wgerError, setWgerError] = useState<string | null>(null)
  const [importing, setImporting] = useState<Set<number>>(new Set())

  const qc = useQueryClient()

  // Búsqueda en la API externa de wger vía TanStack Query.
  // enabled cuando el término tiene al menos 2 caracteres.
  const {
    data: wgerResults = [],
    isFetching: wgerLoading,
  } = useQuery({
    queryKey: wgerSearchKey(searchTerm, searchLanguage),
    enabled: searchTerm.length >= 2,
    staleTime: 5 * 60 * 1000, // resultados de búsqueda válidos 5 min
    queryFn: async () => {
      const results = await searchWger(searchTerm, searchLanguage)
      if (results.length === 0) {
        // Sin resultados no es un error de red; se expone vía wgerError (estado local)
        setWgerError(i18n.t('wger.noResults'))
      } else {
        setWgerError(null)
      }
      return results
    },
  })

  // doSearch actualiza el término que dispara la query reactiva.
  // El debounce queda en manos del llamador si hace falta (la API de wger lo tolera).
  const doSearch = useCallback(async (term: string, language = 'es') => {
    if (term.length < 2) return
    setWgerError(null)
    setSearchLanguage(language)
    setSearchTerm(term)
  }, [])

  // importExercise escribe en PocketBase; permanece como función async directa
  // para mantener la firma pública original (devuelve Promise<string>).
  const importExercise = useCallback(async (wgerId: number, language = 'es'): Promise<string> => {
    // Deduplicación: si ya existe en catálogo local, devolver su id
    try {
      const existing = await pb.collection('exercises_catalog').getFirstListItem(`wger_id = ${wgerId}`)
      if (existing) return existing.id
    } catch {
      // No encontrado — continuar con la importación
    }

    setImporting(prev => new Set(prev).add(wgerId))
    try {
      const info = await getWgerExerciseInfo(wgerId)
      if (!info) throw new Error(i18n.t('wger.fetchError'))

      const mapped = mapWgerToExerciseCatalog(info, language)

      // Descargar hasta 2 imágenes (la principal primero)
      const imageBlobs: { blob: Blob; name: string }[] = []
      const mainImages = info.images
        .sort((a, b) => (b.is_main ? 1 : 0) - (a.is_main ? 1 : 0))
        .slice(0, 2)

      for (const img of mainImages) {
        const blob = await downloadWgerImage(img.image)
        if (blob) {
          const ext = img.image.split('.').pop()?.split('?')[0] || 'jpg'
          imageBlobs.push({ blob, name: `wger_${wgerId}_${img.id}.${ext}` })
        }
      }

      // Construir FormData para PocketBase
      const formData = new FormData()
      formData.append('name', JSON.stringify(mapped.name))
      formData.append('slug', mapped.slug)
      formData.append('description', JSON.stringify(mapped.description))
      formData.append('muscles', JSON.stringify(mapped.muscles))
      formData.append('category', mapped.category)
      formData.append('equipment', JSON.stringify(mapped.equipment))
      formData.append('priority', mapped.priority)
      formData.append('default_sets', String(mapped.default_sets))
      formData.append('default_reps', mapped.default_reps)
      formData.append('default_rest_seconds', String(mapped.default_rest_seconds))
      formData.append('source', mapped.source)
      formData.append('wger_id', String(mapped.wger_id))
      formData.append('wger_language', mapped.wger_language)

      for (const { blob, name } of imageBlobs) {
        formData.append('default_images', blob, name)
      }

      const record = await pb.collection('exercises_catalog').create(formData)

      // Eliminar del cache de resultados tras importación exitosa
      qc.setQueryData(
        wgerSearchKey(searchTerm, searchLanguage),
        (prev: WgerSearchSuggestion[] | undefined) =>
          (prev ?? []).filter(r => r.data.id !== wgerId),
      )

      return record.id
    } finally {
      setImporting(prev => {
        const next = new Set(prev)
        next.delete(wgerId)
        return next
      })
    }
  }, [qc, searchTerm, searchLanguage])

  const clearResults = useCallback(() => {
    setSearchTerm('')
    setWgerError(null)
  }, [])

  return {
    wgerResults,
    wgerLoading,
    wgerError,
    searchWger: doSearch,
    importExercise,
    importing,
    clearResults,
  }
}
