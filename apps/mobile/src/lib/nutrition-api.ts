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
    formData.append('images', {
      uri: img.uri,
      name: img.fileName || 'photo.jpg',
      type: img.mimeType || 'image/jpeg',
    } as any)
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
  photoUris.forEach((uri, i) => {
    formData.append('photos', {
      uri,
      name: `meal_${i}.jpg`,
      type: 'image/jpeg',
    } as any)
  })
  await pb.collection('nutrition_entries').update(entryId, formData)
}
