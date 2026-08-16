/**
 * Adaptador móvil de `useMealLoggerActions` (#470). El hook de core habla en
 * `File | Blob`; la app nativa maneja URIs de foto. Aquí solo se traduce
 * URI → Blob (`urisToBlobs`), se conserva la edición in-place y se devuelve
 * el id guardado (contrato `onSave` de `MealLoggerSheet`). Toda la lógica de
 * contexto de IA y puntuación de calidad vive en core.
 */
import { useCallback } from 'react'
import { useMealLoggerActions } from '@calistenia/core/hooks/useMealLoggerActions'
import type { NutritionEntry } from '@calistenia/core/types'
import { uriToBlob, urisToBlobs } from '@/lib/image-upload'
import { Sentry } from '@/lib/instrument'
import type { ImageAsset } from '@/components/nutrition/meal-logger-shared'

type CoreDeps = Parameters<typeof useMealLoggerActions>[0]

interface Deps extends Pick<CoreDeps, 'userId' | 'goals' | 'entries' | 'analyzeMeal' | 'scoreMealQuality' | 'saveEntry' | 'updateEntry' | 'getRemainingMacros'> {
  /** Entry en edición: el guardado actualiza en sitio y conserva su loggedAt. */
  editingEntry: NutritionEntry | null
  onEditSaved: () => void
}

/** Lee los assets del picker a Blobs con su content-type (los `File` de web ya lo traen). */
async function assetsToBlobs(images: ImageAsset[]): Promise<Blob[]> {
  return Promise.all(images.map(img => uriToBlob(img.uri, img.mimeType || 'image/jpeg')))
}

export function useMobileMealLoggerActions({
  userId, goals, entries, analyzeMeal, scoreMealQuality, saveEntry, updateEntry, getRemainingMacros,
  editingEntry, onEditSaved,
}: Deps) {
  const onBackgroundError = useCallback((e: unknown, op: string) => {
    Sentry.captureException(e, { tags: { feature: 'nutrition', op } })
  }, [])

  const { handleAnalyze, handleSave } = useMealLoggerActions({
    userId,
    goals,
    entries,
    analyzeMeal,
    scoreMealQuality,
    saveEntry,
    updateEntry,
    getRemainingMacros,
    onBackgroundError,
  })

  const analyzeFromAssets = useCallback(async (
    images: ImageAsset[],
    mealType: string,
    description?: string,
    eatenHour?: number,
  ) => handleAnalyze(await assetsToBlobs(images), mealType, description, eatenHour), [handleAnalyze])

  const saveFromUris = useCallback(async (
    entry: Omit<NutritionEntry, 'id' | 'user'>,
    photoUris?: string[],
  ): Promise<string | void> => {
    // Edición: actualiza el registro existente conservando su loggedAt original.
    if (editingEntry?.id) {
      const { loggedAt: _loggedAt, ...patch } = entry
      await updateEntry(editingEntry.id, patch)
      onEditSaved()
      return
    }
    // Lee las URIs a Blobs y crea la entry CON las fotos en una sola petición
    // (photoUrls pobladas en caché al momento). Si la lectura falla, se guarda
    // sin fotos antes que perder la comida.
    let photoFiles: Blob[] | undefined
    if (photoUris && photoUris.length > 0) {
      try {
        photoFiles = await urisToBlobs(photoUris)
      } catch (e) {
        Sentry.captureException(e, { tags: { feature: 'nutrition', op: 'read_meal_photos' } })
      }
    }
    const saved = await handleSave(entry, photoFiles)
    return saved.id
  }, [editingEntry, updateEntry, onEditSaved, handleSave])

  return { handleAnalyze: analyzeFromAssets, handleSave: saveFromUris }
}
