import PocketBase, { type RecordModel, type RecordAuthResponse } from 'pocketbase'

const PB_URL: string = import.meta.env.VITE_POCKETBASE_URL || (import.meta.env.DEV ? 'http://127.0.0.1:8090' : window.location.origin)

// Singleton — una sola instancia por toda la app
export const pb = new PocketBase(PB_URL)

// El SDK persiste el token en localStorage automáticamente.
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
 * Login con email + password.
 * Lanza ClientResponseError si las credenciales son incorrectas.
 */
export const login = (email: string, password: string): Promise<RecordAuthResponse<RecordModel>> =>
  pb.collection('users').authWithPassword(email, password)

/**
 * Registro de nuevo usuario + login automático.
 */
export interface RegisterData {
  email: string
  password: string
  display_name?: string
  weight?: number | null
  height?: number | null
  age?: number | null
  sex?: string
  level?: string
  goal?: string
}
export const register = async (data: RegisterData): Promise<RecordAuthResponse<RecordModel>> => {
  await pb.collection('users').create({
    email: data.email,
    password: data.password,
    passwordConfirm: data.password,
    display_name: data.display_name || '',
    weight: data.weight ?? null,
    height: data.height ?? null,
    age: data.age ?? null,
    sex: data.sex || '',
    level: data.level || 'principiante',
    goal: data.goal || '',
  })
  return pb.collection('users').authWithPassword(data.email, data.password)
}

/**
 * OAuth2 con Google (o cualquier provider configurado en PocketBase).
 */
export const loginWithOAuth2 = (provider: string): Promise<RecordAuthResponse<RecordModel>> =>
  pb.collection('users').authWithOAuth2({ provider })

/**
 * Refresca el token en el arranque de la app.
 * Si el token guardado ya no es válido, limpia el authStore.
 */
export const tryRefreshAuth = async (): Promise<boolean> => {
  if (!pb.authStore.isValid) return false
  try {
    await pb.collection('users').authRefresh()
    return true
  } catch {
    pb.authStore.clear()
    return false
  }
}

/** Cierra la sesión y limpia el token. */
export const logout = (): void => pb.authStore.clear()

/** Retorna el registro del usuario autenticado, o null. */
export const getCurrentUser = (): RecordModel | null =>
  pb.authStore.isValid ? (pb.authStore as any).record ?? pb.authStore.model : null

export default pb
