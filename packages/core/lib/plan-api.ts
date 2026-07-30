/**
 * Un único transporte para PLANIFICAR.
 *
 * `resolveDispatch` (meal-plan-spec.ts) ya decidió endpoint y cuerpo; aquí solo
 * se manda. Que exista un solo `runPlanDispatch` es el punto: antes había tres
 * wrappers distintos para "generar un plan" repartidos entre pantry-api y
 * ai-jobs-api, y por eso la pantalla podía ofrecer botones que llamaban a lo
 * mismo sin que nadie lo notara.
 */
import { AI_API_URL } from './ai-api'
import { pb } from './pocketbase'
import type { PlanDispatch } from './meal-plan-spec'
import type { PantryPlannedMeal } from '../types'

const PATH_BY_ENDPOINT: Record<PlanDispatch['endpoint'], string> = {
  'pantry-day': '/api/generate-pantry-plan',
  'free-day': '/api/generate-meal-plan',
  'pantry-week': '/api/jobs/generate-pantry-plan',
  'free-week': '/api/jobs/generate-weekly-meal-plan',
}

async function postPlanJson<T>(path: string, body: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (pb.authStore.token) headers['Authorization'] = `Bearer ${pb.authStore.token}`
  const res = await fetch(`${AI_API_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error || `Error ${res.status}`)
  }
  return res.json() as Promise<T>
}

/** Respuesta de un plan de día: llega completa, no hay job que esperar. */
export interface SyncPlanResult {
  mode: 'sync'
  meals: PantryPlannedMeal[]
  notes: string
  model_used: string
}

/** Respuesta de un plan semanal: solo el id del job, el resultado llega después. */
export interface JobPlanResult {
  mode: 'job'
  jobId: string
}

export type PlanRunResult = SyncPlanResult | JobPlanResult

/**
 * Sobrecargas para que el modo del dispatch determine el tipo del resultado:
 * un plan de día SIEMPRE trae comidas y un semanal SIEMPRE trae job id, y quien
 * llama no tiene que volver a comprobarlo.
 */
export async function runPlanDispatch(dispatch: Extract<PlanDispatch, { mode: 'sync' }>): Promise<SyncPlanResult>
export async function runPlanDispatch(dispatch: Extract<PlanDispatch, { mode: 'job' }>): Promise<JobPlanResult>
export async function runPlanDispatch(dispatch: PlanDispatch): Promise<PlanRunResult>
export async function runPlanDispatch(dispatch: PlanDispatch): Promise<PlanRunResult> {
  const path = PATH_BY_ENDPOINT[dispatch.endpoint]

  if (dispatch.mode === 'sync') {
    const data = await postPlanJson<{ meals?: PantryPlannedMeal[]; notes?: string; model_used?: string }>(
      path,
      dispatch.body,
    )
    return {
      mode: 'sync',
      meals: data.meals ?? [],
      notes: data.notes ?? '',
      model_used: data.model_used ?? '',
    }
  }

  const data = await postPlanJson<{ job_id: string }>(path, dispatch.body)
  return { mode: 'job', jobId: data.job_id }
}
