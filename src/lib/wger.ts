/**
 * wger API client — search and fetch exercise data from wger.de
 */

const WGER_BASE = 'https://wger.de/api/v2'

// ── Types ───────────────────────────────────────────────────────────────────

export interface WgerSearchSuggestion {
  data: {
    id: number
    name: string
    category: { id: number; name: string }
  }
}

interface WgerSearchResponse {
  suggestions: WgerSearchSuggestion[]
}

export interface WgerMuscle {
  id: number
  name: string
  name_en: string
}

export interface WgerEquipment {
  id: number
  name: string
}

export interface WgerCategory {
  id: number
  name: string
}

export interface WgerImage {
  id: number
  image: string
  is_main: boolean
}

export interface WgerVideo {
  id: number
  video: string
}

export interface WgerTranslation {
  id: number
  language: number
  name: string
  description: string
}

export interface WgerExerciseInfo {
  id: number
  name: string
  description: string
  muscles: WgerMuscle[]
  muscles_secondary: WgerMuscle[]
  equipment: WgerEquipment[]
  category: WgerCategory
  images: WgerImage[]
  videos: WgerVideo[]
  translations: WgerTranslation[]
}

// ── API functions ───────────────────────────────────────────────────────────

export async function searchWger(term: string, language = 'es'): Promise<WgerSearchSuggestion[]> {
  try {
    const url = `${WGER_BASE}/exercisesearch/?term=${encodeURIComponent(term)}&language=${language}&format=json`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return []
    const data: WgerSearchResponse = await res.json()
    return data.suggestions || []
  } catch {
    return []
  }
}

export async function getWgerExerciseInfo(id: number): Promise<WgerExerciseInfo | null> {
  try {
    const url = `${WGER_BASE}/exerciseinfo/${id}/?format=json`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function downloadWgerImage(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return null
    return await res.blob()
  } catch {
    return null
  }
}
