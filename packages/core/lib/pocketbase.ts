import PocketBase, { type RecordModel, type RecordAuthResponse } from 'pocketbase'
import { getEnv, getPlatform } from '../platform'
import { isNetworkError } from './offlineQueue'

// La URL la resuelve cada plataforma en initCore() (web prod: window.location.origin).
const PB_URL: string = getEnv().pbUrl

// Singleton — una sola instancia por toda la app.
// En web el SDK persiste el token en localStorage (authStore default);
// en mobile la plataforma inyecta un AsyncAuthStore (MMKV/AsyncStorage).
export const pb = new PocketBase(PB_URL, getPlatform().pbAuthStore)

// pb.authStore.isValid chequea la expiración del JWT localmente.

/**
 * Retorna true si PocketBase responde.
 * Deduplicates concurrent calls and caches a successful result for 30s.
 * A failed result is never cached so a retry always re-checks.
 */
let _pbAvailablePromise: Promise<boolean> | null = null
let _pbAvailableResult: boolean | null = null
let _pbAvailableAt: number = 0
export const isPocketBaseAvailable = async (): Promise<boolean> => {
  const now = Date.now()
  // Return cached success for up to 30s
  if (_pbAvailableResult === true && now - _pbAvailableAt < 30_000) return true
  // Deduplicate concurrent in-flight requests
  if (_pbAvailablePromise) return _pbAvailablePromise
  _pbAvailablePromise = (async () => {
    try {
      await pb.health.check()
      _pbAvailableResult = true
      _pbAvailableAt = Date.now()
    } catch {
      _pbAvailableResult = false
    }
    _pbAvailablePromise = null
    return _pbAvailableResult!
  })()
  return _pbAvailablePromise
}

/**
 * Sincroniza display_name y avatar desde el provider OAuth si faltan.
 * Compartido por el flujo realtime (web) y el flujo code/deep-link (mobile).
 */
const syncOAuthProfile = async (result: RecordAuthResponse<RecordModel>): Promise<void> => {
  const needsName = !result.record.display_name && result.meta?.name
  const needsAvatar = !result.record.avatar && result.meta?.avatarURL
  if (!needsName && !needsAvatar) return

  try {
    const formData = new FormData()

    if (needsName) {
      formData.append('display_name', result.meta!.name)
    }

    if (needsAvatar) {
      const response = await fetch(result.meta!.avatarURL)
      if (response.ok) {
        const blob = await response.blob()
        const ext = blob.type === 'image/png' ? 'png' : 'jpg'
        formData.append('avatar', new File([blob], `google-avatar.${ext}`, { type: blob.type }))
      }
    }

    await pb.collection('users').update(result.record.id, formData)
    await pb.collection('users').authRefresh()
  } catch (e) {
    console.warn('Failed to sync OAuth profile:', e)
  }
}

/**
 * OAuth2 con Google via flujo realtime del SDK (lo usa la WEB: popup + SSE).
 * After login, if the user has no avatar yet, fetches their Google profile picture
 * and uploads it to PocketBase.
 *
 * urlCallback: en web se omite (el SDK abre un popup).
 * requestKey: permite cancelar el flujo desde fuera con pb.cancelRequest(requestKey).
 *
 * NO usar en mobile: el flujo realtime espera el código OAuth por un socket SSE que
 * algunos Android agresivos (Honor/MagicOS) congelan al pasar la app a background al
 * abrir el navegador → login colgado para siempre. En mobile usar loginWithOAuth2Code.
 */
export const loginWithOAuth2 = async (
  provider: string,
  urlCallback?: (url: string) => void | Promise<void>,
  requestKey?: string
): Promise<RecordAuthResponse<RecordModel>> => {
  const result = await pb.collection('users').authWithOAuth2({
    provider,
    urlCallback,
    ...(requestKey ? { requestKey } : {}),
  })
  await syncOAuthProfile(result)
  return result
}

/**
 * OAuth2 con flujo de código (deep-link), SIN depender del SSE realtime — para mobile.
 *
 * A diferencia de loginWithOAuth2, el código no llega por un socket SSE de larga vida
 * (que MagicOS/Honor congela en background) sino por un redirect/deep-link de un solo
 * uso, inmune a ese freeze.
 *
 * @param redirectUrl URL https registrada como "Authorized redirect URI" en el cliente
 *   OAuth de Google y servida en pb_public; su única función es reenviar el code+state
 *   al esquema de la app (calistenia://). Debe ser IDÉNTICA en la request de
 *   autorización y en el intercambio del código (Google lo exige).
 * @param getCode abre authUrl en el navegador y devuelve el code+state del redirect.
 */
export const loginWithOAuth2Code = async (
  provider: string,
  redirectUrl: string,
  getCode: (authUrl: string) => Promise<{ code: string; state: string }>
): Promise<RecordAuthResponse<RecordModel>> => {
  const methods = await pb.collection('users').listAuthMethods()
  const cfg = methods.oauth2.providers.find((p) => p.name === provider)
  if (!cfg) throw new Error(`OAuth provider "${provider}" no disponible`)

  // PB devuelve authURL terminando en `redirect_uri=`; se le concatena el redirect.
  const authUrl = cfg.authURL + encodeURIComponent(redirectUrl)
  const { code, state } = await getCode(authUrl)

  if (!code) throw new Error('oauth_no_code')
  // CSRF: el state devuelto debe coincidir con el que generó PB.
  if (cfg.state && state !== cfg.state) throw new Error('oauth_state_mismatch')

  const result = await pb.collection('users').authWithOAuth2Code(provider, code, cfg.codeVerifier, redirectUrl)
  await syncOAuthProfile(result)
  return result
}

/**
 * Refresca el token en el arranque de la app.
 * Si el server RECHAZA el token (401/403…), limpia el authStore.
 * Si no hubo respuesta (offline, server caído), CONSERVA el token: cerrar la
 * sesión por un fallo de red dejaba la app inusable offline y, de rebote, la
 * cola offline se drenaba sin auth y PB descartaba las escrituras pendientes.
 * authStore.isValid ya valida la expiración del JWT localmente, así que un
 * token caducado no se cuela por este camino.
 */
export const tryRefreshAuth = async (): Promise<boolean> => {
  if (!pb.authStore.isValid) return false
  try {
    await pb.collection('users').authRefresh()
    return true
  } catch (e) {
    if (isNetworkError(e)) return pb.authStore.isValid
    // Sesión fantasma: el JWT local no había caducado pero el server lo
    // rechazó (cambio de contraseña, rotación de tokenKey, usuario borrado).
    const status = (e as { status?: number })?.status
    getPlatform().reportError?.(new Error(`[auth] token rechazado por el server (status ${status}): authStore limpiado`))
    pb.authStore.clear()
    return false
  }
}

// ── Detección de sesión fantasma (#254) ──────────────────────────────────────
// Un token invalidado en el server NO produce 401s en las llamadas de datos:
// PB lo degrada a invitado, así que las listas devuelven 200 vacías y los
// creates protegidos fallan con 400 "Failed to create record". La única forma
// de descubrirlo es preguntar explícitamente con authRefresh. verifyAuth()
// envuelve tryRefreshAuth con dedupe + intervalo mínimo para poder llamarlo
// desde puntos calientes (respuestas 4xx, vuelta a foreground) sin spamear.
let _verifyAuthPromise: Promise<boolean> | null = null
let _verifyAuthAt = 0
const VERIFY_AUTH_MIN_INTERVAL_MS = 30_000

export const verifyAuth = (): Promise<boolean> => {
  if (!pb.authStore.isValid) return Promise.resolve(false)
  if (_verifyAuthPromise) return _verifyAuthPromise
  if (Date.now() - _verifyAuthAt < VERIFY_AUTH_MIN_INTERVAL_MS) return Promise.resolve(true)
  _verifyAuthAt = Date.now()
  _verifyAuthPromise = tryRefreshAuth().finally(() => {
    _verifyAuthPromise = null
  })
  return _verifyAuthPromise
}

// Interceptor global de respuestas (#254):
// - 401 con sesión local "válida" → el server rechazó el token: limpiar ya.
// - 400/403/404 con sesión local "válida" → puede ser una regla/validación
//   legítima o una sesión fantasma disfrazada (ver arriba); verifyAuth() lo
//   distingue en segundo plano. Se excluye auth-refresh: sus errores ya los
//   maneja tryRefreshAuth y evitamos re-disparos del propio verificador.
pb.afterSend = (response: Response, data: unknown) => {
  if (pb.authStore.isValid && !response.url.includes('/auth-refresh')) {
    if (response.status === 401) {
      getPlatform().reportError?.(new Error(`[auth] 401 con token local válido (${response.url}): authStore limpiado`))
      pb.authStore.clear()
    } else if (response.status === 400 || response.status === 403 || response.status === 404) {
      void verifyAuth().catch(() => {})
    }
  }
  return data
}

/** Cierra la sesión y limpia el token. */
export const logout = (): void => pb.authStore.clear()

/** Retorna el registro del usuario autenticado, o null. */
export const getCurrentUser = (): RecordModel | null =>
  pb.authStore.isValid ? (pb.authStore as any).record ?? pb.authStore.model : null

/**
 * Returns the URL for a user's avatar thumbnail, or null if no avatar.
 */
export const getUserAvatarUrl = (user: RecordModel, thumb: string = '200x200'): string | null => {
  if (!user.avatar) return null
  return pb.files.getURL(user, user.avatar, { thumb })
}

export default pb
