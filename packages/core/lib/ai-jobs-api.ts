/**
 * API wrappers for background AI job endpoints.
 */

import { AI_API_URL } from './ai-api'
import { pb } from './pocketbase'

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}
  if (pb.authStore.token) {
    headers['Authorization'] = `Bearer ${pb.authStore.token}`
  }
  return headers
}

export async function submitAnalyzeMealJob(
  files: File[],
  mealType: string,
  description?: string,
  userContext?: { goal?: string; remainingMacros?: { calories: number; protein: number; carbs: number; fat: number }; recentScores?: { mealType: string; score: string; loggedAt: string }[]; logHour?: number },
): Promise<string> {
  const formData = new FormData()
  for (const file of files) {
    formData.append('images', file)
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

  const res = await fetch(`${AI_API_URL}/api/jobs/analyze-meal`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Error ${res.status}`)
  }
  const data = await res.json()
  return data.job_id
}

export async function submitMealPlanJob(macros: {
  remaining_calories: number
  remaining_protein: number
  remaining_carbs: number
  remaining_fat: number
  logged_meal_types: string[]
}): Promise<string> {
  const res = await fetch(`${AI_API_URL}/api/jobs/generate-meal-plan`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(macros),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Error ${res.status}`)
  }
  const data = await res.json()
  return data.job_id
}

export async function submitWeeklyMealPlanJob(macros: {
  daily_calories: number
  daily_protein: number
  daily_carbs: number
  daily_fat: number
  goal: string
  week_start?: string
}): Promise<string> {
  const res = await fetch(`${AI_API_URL}/api/jobs/generate-weekly-meal-plan`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(macros),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Error ${res.status}`)
  }
  const data = await res.json()
  return data.job_id
}

export async function regeneratePlanDay(planDayId: string): Promise<any> {
  const res = await fetch(`${AI_API_URL}/api/weekly-plan/regenerate-day`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan_day_id: planDayId }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Error ${res.status}`)
  }
  return res.json()
}

export interface AIJob {
  id: string
  type: 'analyze-meal' | 'lookup-food' | 'generate-meal-plan' | 'generate-weekly-meal-plan' | 'generate-pantry-plan'
  status: 'pending' | 'processing' | 'completed' | 'failed'
  result: any
  error: string | null
  created: string
  updated: string
}

export async function fetchJobStatus(jobId: string): Promise<AIJob> {
  const res = await fetch(`${AI_API_URL}/api/jobs/${jobId}`, {
    headers: authHeaders(),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Error ${res.status}`)
  }
  return res.json()
}

export interface PollJobOptions {
  /** Pausa entre consultas (por defecto 3 s). */
  intervalMs?: number
  /** Tope total de espera; superado, lanza `timeoutMessage`. */
  maxMs: number
  /** Devuelve false cuando el llamador ya no quiere el resultado (unmount). */
  isAlive?: () => boolean
  timeoutMessage?: string
  failedMessage?: string
}

/**
 * Pollea un job de IA hasta `completed` / `failed` / timeout. Un blip de red
 * transitorio NO aborta: el job sigue corriendo server-side y `maxMs` acota.
 * Resuelve `null` (sin lanzar) si `isAlive()` pasa a false a mitad — el
 * llamador se desmontó y no debe tocar estado.
 */
export async function pollJob(jobId: string, opts: PollJobOptions): Promise<AIJob | null> {
  const {
    intervalMs = 3000,
    maxMs,
    isAlive = () => true,
    timeoutMessage = 'Tiempo de espera agotado',
    failedMessage = 'El trabajo falló',
  } = opts
  const started = Date.now()
  while (Date.now() - started < maxMs) {
    await new Promise((r) => setTimeout(r, intervalMs))
    if (!isAlive()) return null
    let job: AIJob
    try {
      job = await fetchJobStatus(jobId)
    } catch {
      continue
    }
    if (!isAlive()) return null
    if (job.status === 'completed') return job
    if (job.status === 'failed') throw new Error(job.error || failedMessage)
  }
  if (!isAlive()) return null
  throw new Error(timeoutMessage)
}
