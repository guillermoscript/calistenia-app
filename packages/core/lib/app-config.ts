/**
 * Version gate + feature flags remotos.
 *
 * EL PROBLEMA: una vez publicas en Play tienes N versiones del cliente vivas a
 * la vez y no hay ningún botón que mate las viejas. Todo lo que se pueda
 * arreglar en el servidor se arregla en el servidor (reglas de API, hooks);
 * pero cuando eso NO basta — el cliente viejo es peligroso, o el esquema cambió
 * de forma incompatible — hace falta poder decirle "actualiza antes de seguir".
 * Eso es esto.
 *
 * TRES NIVELES, de menos a más agresivo:
 *   flags               → apagar una función concreta sin desplegar nada.
 *   build < latest      → aviso suave, descartable.
 *   build < minSupported→ pantalla bloqueante con botón a la tienda.
 *
 * DOS INVARIANTES DE SEGURIDAD, ambas en `evaluateUpdate`:
 *   1. Falla abierto. Sin config, sin red, o cliente sin identificar (build 0,
 *      que es el caso de la web) → 'ok'. Un bug aquí no puede dejar a nadie
 *      fuera de la app.
 *   2. `min_supported_build = 0` (el default) desactiva el bloqueo. El gate no
 *      hace nada hasta que alguien sube ese número a mano.
 *
 * La config se cachea en disco a propósito: un kill switch que se esquiva
 * poniendo el móvil en modo avión no es un kill switch. El caché caduca a los
 * 30 días para que bajar `min_supported_build` en el servidor libere también a
 * los clientes que llevan tiempo sin conectar.
 */
import { getClientInfo, getEnv, storage, type CoreAppPlatform } from '../platform'

export type UpdateStatus = 'ok' | 'optional' | 'required'

export interface AppConfig {
  platform: CoreAppPlatform
  /** Por debajo de este build la app se bloquea. 0 = gate desactivado. */
  min_supported_build: number
  /** Último build publicado. 0 = sin aviso suave. */
  latest_build: number
  latest_version: string
  /** A dónde manda el botón "Actualizar" (Play Store / App Store). */
  store_url: string
  /** Clave i18n del motivo, NO texto: el cliente la traduce a su idioma. */
  message_key: string
  flags: Record<string, boolean>
}

interface CachedAppConfig {
  config: AppConfig
  cached_at: number
}

/** No va en USER_SCOPED_STORAGE_KEYS: es estado del dispositivo, no del usuario. */
export const APP_CONFIG_STORAGE_KEY = 'calistenia_app_config'

const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 días
const FETCH_TIMEOUT_MS = 8_000

/**
 * Decide si el build actual puede seguir usando la app.
 *
 * Pura y sin efectos: es el único sitio donde vive la decisión de bloquear a
 * un usuario, así que tiene que ser trivial de leer y de testear.
 */
export function evaluateUpdate(build: number, config: AppConfig | null): UpdateStatus {
  if (!config) return 'ok'
  // build <= 0 = cliente que no se identifica (web, o un móvil sin
  // expo-application). Nunca se bloquea a quien no sabemos quién es.
  if (!Number.isFinite(build) || build <= 0) return 'ok'

  if (config.min_supported_build > 0 && build < config.min_supported_build) return 'required'
  if (config.latest_build > 0 && build < config.latest_build) return 'optional'
  return 'ok'
}

/** Lee un flag remoto. Sin config o sin el flag → `fallback` (el comportamiento actual). */
export function isFlagEnabled(config: AppConfig | null, flag: string, fallback = true): boolean {
  const value = config?.flags?.[flag]
  return typeof value === 'boolean' ? value : fallback
}

/** Normaliza la respuesta del servidor: nunca confiamos en que los campos vengan. */
function parseConfig(raw: unknown): AppConfig | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const num = (v: unknown): number => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  }
  return {
    platform: (typeof r.platform === 'string' ? r.platform : 'unknown') as CoreAppPlatform,
    min_supported_build: num(r.min_supported_build),
    latest_build: num(r.latest_build),
    latest_version: typeof r.latest_version === 'string' ? r.latest_version : '',
    store_url: typeof r.store_url === 'string' ? r.store_url : '',
    message_key: typeof r.message_key === 'string' ? r.message_key : '',
    flags: r.flags && typeof r.flags === 'object' && !Array.isArray(r.flags)
      ? (r.flags as Record<string, boolean>)
      : {},
  }
}

export function readCachedConfig(now: number = Date.now()): AppConfig | null {
  try {
    const raw = storage.getItem(APP_CONFIG_STORAGE_KEY)
    if (!raw) return null
    const cached = JSON.parse(raw) as CachedAppConfig
    if (!cached?.config || typeof cached.cached_at !== 'number') return null
    // Caché rancio: si el servidor bajó el mínimo hace semanas, un cliente que
    // no se conecta no puede quedarse bloqueado para siempre por lo que dijimos
    // hace un mes.
    if (now - cached.cached_at > CACHE_MAX_AGE_MS) return null
    return cached.config
  } catch {
    return null
  }
}

function writeCachedConfig(config: AppConfig): void {
  try {
    storage.setItem(APP_CONFIG_STORAGE_KEY, JSON.stringify({ config, cached_at: Date.now() }))
  } catch {
    /* almacenamiento lleno o no disponible: seguimos sin caché */
  }
}

/**
 * Pide la config al servidor; si no hay red, cae al último valor conocido.
 *
 * Usa `fetch` directo y NO el SDK de PocketBase a propósito: este endpoint
 * tiene que responder aunque el authStore esté corrupto, y el interceptor
 * `afterSend` de pocketbase.ts reacciona a los 4xx disparando verifyAuth().
 */
export async function fetchAppConfig(): Promise<AppConfig | null> {
  const { platform, build } = getClientInfo()
  const base = getEnv().pbUrl
  const url = `${base}/api/app-config?platform=${encodeURIComponent(platform)}&build=${build}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
    if (!res.ok) return readCachedConfig()
    const config = parseConfig(await res.json())
    if (config) writeCachedConfig(config)
    return config ?? readCachedConfig()
  } catch {
    return readCachedConfig()
  } finally {
    clearTimeout(timer)
  }
}
