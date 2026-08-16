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
  /**
   * Identidad del cliente — la manda `pocketbase.ts` en cada request como
   * cabeceras `X-App-*` y la usa el version gate (`lib/app-config.ts`).
   *
   * Es OPCIONAL a propósito: los tests de core llaman a initCore() con un env
   * mínimo, y sobre todo el gate falla ABIERTO. Un cliente que no se identifica
   * nunca se queda bloqueado; solo se vuelve invisible en las métricas.
   */
  client?: CoreClientInfo
}

export type CoreAppPlatform = 'web' | 'android' | 'ios' | 'unknown'

export interface CoreClientInfo {
  /** Versión visible, semver. Móvil: `app.json` → expo.version. Web: el package.json. */
  version: string
  /**
   * Entero monótono que identifica el BUILD, no la versión visible.
   * Android: `versionCode`. iOS: `CFBundleVersion`. Web: 0 (siempre al día,
   * el service worker ya la actualiza sola).
   */
  build: number
  platform: CoreAppPlatform
}

/** Cliente sin identificar — el gate lo trata como "nunca bloquear". */
export const UNKNOWN_CLIENT: CoreClientInfo = { version: '0.0.0', build: 0, platform: 'unknown' }

export interface CoreAnalytics {
  track(name: string, properties?: Record<string, unknown>): unknown
  identify(payload: { profileId: string } & Record<string, unknown>): unknown
  clear(): unknown
}

export interface CoreConnectivity {
  isOnline(): boolean
  /** Suscribe un handler a "volvimos a estar online". Retorna el unsubscribe. */
  onOnline(handler: () => void): () => void
  /**
   * Suscribe a CADA transición online/offline (ambas direcciones). Opcional:
   * si falta, React Query cae a onOnline (solo detecta reconexión). Lo usa
   * onlineManager para pausar queries/mutations cuando se pierde la red.
   */
  onChange?(handler: (online: boolean) => void): () => void
}

export interface CorePlatform {
  storage: CoreStorage
  env: CoreEnv
  analytics: CoreAnalytics
  connectivity: CoreConnectivity
  /** Solo RN: authStore persistente para el SDK de PocketBase. Web usa el default (localStorage). */
  pbAuthStore?: AsyncAuthStore
  /** Reporte de errores a monitoreo (web: Sentry browser; RN: @sentry/react-native). */
  reportError?: (error: unknown) => void
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

/** Identidad del cliente, o UNKNOWN_CLIENT si la plataforma no la declaró. */
export const getClientInfo = (): CoreClientInfo => getPlatform().env.client ?? UNKNOWN_CLIENT

/**
 * Objeto estable con la misma forma que localStorage (sync) — los hooks lo usan
 * como reemplazo directo. Delega en la implementación inyectada.
 */
export const storage: CoreStorage = {
  getItem: (key) => getPlatform().storage.getItem(key),
  setItem: (key, value) => getPlatform().storage.setItem(key, value),
  removeItem: (key) => getPlatform().storage.removeItem(key),
}
