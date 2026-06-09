/**
 * Platform adapter — el único punto donde core toca APIs específicas de plataforma.
 *
 * Cada app llama initCore() UNA VEZ antes de importar cualquier otro módulo de core
 * (en web: import './lib/init-core' como primer import de main.tsx tras Sentry).
 *
 *   web    → storage: localStorage,        env: import.meta.env, analytics: @openpanel/web
 *   mobile → storage: MMKV/AsyncStorage,   env: EXPO_PUBLIC_*,   analytics: @openpanel/react-native
 */
import type { AsyncAuthStore } from 'pocketbase'

export interface CoreStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface CoreEnv {
  /** URL base de PocketBase (en web prod: window.location.origin). */
  pbUrl: string
  /** URL base del AI API ('' en dev web = proxy de Vite). */
  aiApiUrl: string
  isDev: boolean
}

export interface CoreAnalytics {
  track(name: string, properties?: Record<string, unknown>): unknown
  identify(payload: { profileId: string } & Record<string, unknown>): unknown
  clear(): unknown
}

export interface CoreConnectivity {
  isOnline(): boolean
  /** Suscribe un handler a "volvimos a estar online". Retorna el unsubscribe. */
  onOnline(handler: () => void): () => void
}

export interface CorePlatform {
  storage: CoreStorage
  env: CoreEnv
  analytics: CoreAnalytics
  connectivity: CoreConnectivity
  /** Solo RN: authStore persistente para el SDK de PocketBase. Web usa el default (localStorage). */
  pbAuthStore?: AsyncAuthStore
}

let platform: CorePlatform | null = null

export function initCore(p: CorePlatform): void {
  platform = p
}

export function getPlatform(): CorePlatform {
  if (!platform) {
    throw new Error(
      '[core] initCore() no fue llamado. Importa el init de plataforma (p.ej. lib/init-core) antes que cualquier módulo de @calistenia/core.'
    )
  }
  return platform
}

export const getEnv = (): CoreEnv => getPlatform().env

/**
 * Objeto estable con la misma forma que localStorage (sync) — los hooks lo usan
 * como reemplazo directo. Delega en la implementación inyectada.
 */
export const storage: CoreStorage = {
  getItem: (key) => getPlatform().storage.getItem(key),
  setItem: (key, value) => getPlatform().storage.setItem(key, value),
  removeItem: (key) => getPlatform().storage.removeItem(key),
}
