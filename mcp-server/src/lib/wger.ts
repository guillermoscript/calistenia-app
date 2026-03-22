/**
 * wger API client for MCP server (Node.js)
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
  videos: Array<{ id: number; video: string }>
  translations: WgerTranslation[]
}

// ── API functions ───────────────────────────────────────────────────────────

async function fetchWgerSearch(term: string, langCode: string): Promise<WgerSearchSuggestion[]> {
  try {
    const url = `${WGER_BASE}/exercisesearch/?term=${encodeURIComponent(term)}&language=${langCode}&format=json`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return []
    const data: WgerSearchResponse = await res.json()
    return data.suggestions || []
  } catch {
    return []
  }
}

export async function searchWger(term: string, language = 'es'): Promise<WgerSearchSuggestion[]> {
  const results = await fetchWgerSearch(term, language)
  if (results.length > 0) return results
  // Fallback to English when requested language returns nothing
  if (language !== 'en') return fetchWgerSearch(term, 'en')
  return []
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

export async function downloadWgerImage(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return null
    const arrayBuffer = await res.arrayBuffer()
    return Buffer.from(arrayBuffer)
  } catch {
    return null
  }
}
