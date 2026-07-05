import { AI_API_URL } from './ai-api'
import { pb } from './pocketbase'
import type { HowManyMealsResult, PantryDayPlanResult, PantryParseResult, PantrySnapshotItem } from '../types'

export interface PantryPlanGoals {
  calories: number
  protein: number
  carbs: number
  fat: number
}

async function postPantryJson<T>(path: string, body: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (pb.authStore.token) headers['Authorization'] = `Bearer ${pb.authStore.token}`
  const res = await fetch(`${AI_API_URL}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error || `Error ${res.status}`)
  }
  return res.json() as Promise<T>
}

export async function parsePantry(text: string, existingItems: string[]): Promise<PantryParseResult> {
  return postPantryJson('/api/pantry/parse', { text, existing_items: existingItems })
}

/** Plan de UN día desde la despensa (síncrono). targetDate: YYYY-MM-DD. */
export async function generatePantryDayPlan(params: {
  targetDate: string
  items: PantrySnapshotItem[]
  goals: PantryPlanGoals | null
}): Promise<PantryDayPlanResult> {
  return postPantryJson('/api/generate-pantry-plan', {
    horizon: 'day',
    target_date: params.targetDate,
    pantry_items: params.items,
    goals: params.goals,
  })
}

/** "¿Cuántas comidas me alcanzan?" (síncrono). */
export async function fetchHowManyMeals(
  items: PantrySnapshotItem[],
  goals: PantryPlanGoals | null
): Promise<HowManyMealsResult> {
  return postPantryJson('/api/generate-pantry-plan', {
    horizon: 'how_many_meals',
    pantry_items: items,
    goals,
  })
}

/** Plan SEMANAL desde la despensa — job async. Devuelve job_id para pollear. */
export async function submitPantryWeekPlanJob(params: {
  weekStart: string | null
  items: PantrySnapshotItem[]
  goals: PantryPlanGoals
}): Promise<string> {
  const data = await postPantryJson<{ job_id: string }>('/api/jobs/generate-pantry-plan', {
    week_start: params.weekStart,
    pantry_items: params.items,
    goals: params.goals,
  })
  return data.job_id
}
