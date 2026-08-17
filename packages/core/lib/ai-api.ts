/**
 * Resolved AI API base URL.
 *
 * La resolución por plataforma (VITE_AI_API_URL / proxy de Vite en dev /
 * EXPO_PUBLIC_AI_API_URL) la hace cada app al llamar initCore().
 */
import { getEnv } from '../platform'
import { pb } from './pocketbase'

export const AI_API_URL: string = getEnv().aiApiUrl

export interface AiApiFetchInit extends Omit<RequestInit, 'headers'> {
  headers?: Record<string, string>
  /** Se serializa como body JSON y añade `Content-Type: application/json`. */
  json?: unknown
}

/**
 * `fetch` contra la AI API con el bearer de PocketBase.
 *
 * Único punto que sabe montar `Authorization` desde `pb.authStore.token`
 * (antes vivía copiado en 6 hooks). Para JSON usar `json:`; para FormData
 * pasar `body` directamente — ahí el Content-Type (con boundary) lo pone el
 * propio fetch y NO hay que fijarlo a mano.
 */
export async function aiApiFetch(path: string, init: AiApiFetchInit = {}): Promise<Response> {
  const { json, headers: extraHeaders, ...rest } = init
  const headers: Record<string, string> = { ...extraHeaders }
  if (json !== undefined) headers['Content-Type'] = 'application/json'
  if (pb.authStore.token) headers['Authorization'] = `Bearer ${pb.authStore.token}`
  return fetch(`${AI_API_URL}${path}`, {
    ...rest,
    headers,
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
  })
}
