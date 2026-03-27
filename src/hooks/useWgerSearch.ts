import { useState, useCallback } from 'react'
import i18n from '../lib/i18n'
import { pb } from '../lib/pocketbase'
import { searchWger, getWgerExerciseInfo, downloadWgerImage } from '../lib/wger'
import { mapWgerToExerciseCatalog } from '../lib/wger-mappings'
import type { WgerSearchSuggestion } from '../lib/wger'

export function useWgerSearch() {
  const [wgerResults, setWgerResults] = useState<WgerSearchSuggestion[]>([])
  const [wgerLoading, setWgerLoading] = useState(false)
  const [wgerError, setWgerError] = useState<string | null>(null)
  const [importing, setImporting] = useState<Set<number>>(new Set())

  const doSearch = useCallback(async (term: string, language = 'es') => {
    if (term.length < 2) return
    setWgerLoading(true)
    setWgerError(null)
    try {
      const results = await searchWger(term, language)
      setWgerResults(results)
      if (results.length === 0) {
        setWgerError(i18n.t('wger.noResults'))
      }
    } catch {
      setWgerError(i18n.t('wger.searchError'))
      setWgerResults([])
    } finally {
      setWgerLoading(false)
    }
  }, [])

  const importExercise = useCallback(async (wgerId: number, language = 'es'): Promise<string> => {
    // Check deduplication
    try {
      const existing = await pb.collection('exercises_catalog').getFirstListItem(`wger_id = ${wgerId}`)
      if (existing) return existing.id
    } catch {
      // Not found — proceed with import
    }

    setImporting(prev => new Set(prev).add(wgerId))
    try {
      const info = await getWgerExerciseInfo(wgerId)
      if (!info) throw new Error(i18n.t('wger.fetchError'))

      const mapped = mapWgerToExerciseCatalog(info, language)

      // Download up to 2 images
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

      // Build FormData for PocketBase
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

      // Remove from wger results after successful import
      setWgerResults(prev => prev.filter(r => r.data.id !== wgerId))

      return record.id
    } finally {
      setImporting(prev => {
        const next = new Set(prev)
        next.delete(wgerId)
        return next
      })
    }
  }, [])

  const clearResults = useCallback(() => {
    setWgerResults([])
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
