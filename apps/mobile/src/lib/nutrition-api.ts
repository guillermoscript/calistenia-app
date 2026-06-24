// Mobile-specific meal analysis API — uses URI instead of File
import { AI_API_URL } from '@calistenia/core/lib/ai-api'
import { pb } from '@calistenia/core/lib/pocketbase'
import type { FoodItem, DailyTotals, QualityScore, QualityBreakdown, QualitySuggestion } from '@calistenia/core/types'

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {}
  if (pb.authStore.token) h['Authorization'] = `Bearer ${pb.authStore.token}`
  return h
}

export interface ImageAsset {
  uri: string
  mimeType?: string
  fileName?: string
}

// El `fetch`/`FormData` globales en Expo SDK 56 son la implementación WinterCG
// (expo/fetch). Esa implementación NO soporta el shape `{ uri, name, type }` de
// React Native: convertFormDataAsync sólo acepta string | Blob | File y lanza
// "Unsupported FormDataPart implementation" con cualquier otro objeto. Por eso
// hay que leer el archivo local a un Blob real antes de adjuntarlo. XMLHttpRequest
// usa la red nativa de RN, que sí resuelve los esquemas file:// / content:// / ph://.
async function uriToBlob(uri: string, mimeType?: string): Promise<Blob> {
  const blob: Blob = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.onload = () => resolve(xhr.response as Blob)
    xhr.onerror = () => reject(new Error('No se pudo leer la imagen seleccionada'))
    // Una lectura de archivo local es instantánea; el timeout sólo evita que un
    // uri corrupto / sin permiso deje el spinner colgado para siempre.
    xhr.timeout = 20_000
    xhr.ontimeout = () => reject(new Error('La lectura de la imagen tardó demasiado'))
    xhr.responseType = 'blob'
    xhr.open('GET', uri, true)
    xhr.send(null)
  })
  // Garantiza un content-type explícito (algunos uris devuelven type vacío → 415).
  if (mimeType && blob.type !== mimeType) return new Blob([blob], { type: mimeType })
  if (!blob.type) return new Blob([blob], { type: 'image/jpeg' })
  return blob
}

export type AnalyzeResult = {
  foods: FoodItem[]
  meal_description?: string
  quality?: {
    score: QualityScore
    breakdown: QualityBreakdown
    message: string
    suggestion: QualitySuggestion | null
  }
}

export async function analyzeMealMobile(
  images: ImageAsset[],
  mealType: string,
  description?: string,
  userContext?: {
    goal?: string
    remainingMacros?: DailyTotals
    recentScores?: { mealType: string; score: string; loggedAt: string }[]
    logHour?: number
  },
): Promise<AnalyzeResult & { totals: DailyTotals; ai_model: string }> {
  const formData = new FormData()
  for (const img of images) {
    const blob = await uriToBlob(img.uri, img.mimeType || 'image/jpeg')
    formData.append('images', blob, img.fileName || 'photo.jpg')
  }
  formData.append('meal_type', mealType)
  if (description) formData.append('description', description)
  if (userContext) {
    if (userContext.goal) formData.append('goal', userContext.goal)
    if (userContext.logHour != null) formData.append('log_hour', String(userContext.logHour))
    if (userContext.remainingMacros) {
      formData.append('remaining_calories', String(userContext.remainingMacros.calories))
      formData.append('remaining_protein', String(userContext.remainingMacros.protein))
      formData.append('remaining_carbs', String(userContext.remainingMacros.carbs))
      formData.append('remaining_fat', String(userContext.remainingMacros.fat))
    }
    if (userContext.recentScores) formData.append('recent_scores', JSON.stringify(userContext.recentScores))
  }

  const res = await fetch(`${AI_API_URL}/api/analyze-meal`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Error ${res.status}`)
  }
  const data = await res.json()
  const foods = data.analysis?.foods ?? []
  return {
    foods,
    totals: data.analysis?.totals ?? { calories: 0, protein: 0, carbs: 0, fat: 0 },
    meal_description: data.analysis?.meal_description || '',
    ai_model: data.model_used || 'unknown',
    quality: data.analysis?.quality || undefined,
  }
}

// Save photo URIs to a nutrition entry via PocketBase multipart upload
export async function saveEntryWithPhotos(
  entryId: string,
  photoUris: string[],
): Promise<void> {
  if (photoUris.length === 0) return
  const formData = new FormData()
  for (let i = 0; i < photoUris.length; i++) {
    const blob = await uriToBlob(photoUris[i], 'image/jpeg')
    formData.append('photos', blob, `meal_${i}.jpg`)
  }
  await pb.collection('nutrition_entries').update(entryId, formData)
}
