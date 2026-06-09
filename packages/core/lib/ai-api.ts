/**
 * Resolved AI API base URL.
 *
 * La resolución por plataforma (VITE_AI_API_URL / proxy de Vite en dev /
 * EXPO_PUBLIC_AI_API_URL) la hace cada app al llamar initCore().
 */
import { getEnv } from '../platform'

export const AI_API_URL: string = getEnv().aiApiUrl
