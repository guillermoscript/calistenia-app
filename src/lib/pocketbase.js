import PocketBase from 'pocketbase'

const PB_URL = import.meta.env.VITE_POCKETBASE_URL || (import.meta.env.DEV ? 'http://127.0.0.1:8090' : window.location.origin)

// Singleton — una sola instancia por toda la app
export const pb = new PocketBase(PB_URL)

// El SDK persiste el token en localStorage automáticamente.
// pb.authStore.isValid chequea la expiración del JWT localmente.

/**
 * Retorna true si PocketBase responde.
 * Deduplicates concurrent calls and caches a successful result for 30s.
 * A failed result is never cached so a retry always re-checks.
 */
let _pbAvailablePromise = null
let _pbAvailableResult  = null
let _pbAvailableAt      = 0
export const isPocketBaseAvailable = async () => {
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
    return _pbAvailableResult
  })()
  return _pbAvailablePromise
}

/**
 * Login con email + password.
 * Lanza ClientResponseError si las credenciales son incorrectas.
 */
export const login = (email, password) =>
  pb.collection('users').authWithPassword(email, password)

/**
 * Registro de nuevo usuario + login automático.
 */
export const register = async (email, password, displayName) => {
  await pb.collection('users').create({
    email,
    password,
    passwordConfirm: password,
    display_name: displayName || '',
  })
  return pb.collection('users').authWithPassword(email, password)
}

/**
 * Refresca el token en el arranque de la app.
 * Si el token guardado ya no es válido, limpia el authStore.
 */
export const tryRefreshAuth = async () => {
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
export const logout = () => pb.authStore.clear()

/** Retorna el registro del usuario autenticado, o null. */
export const getCurrentUser = () =>
  pb.authStore.isValid ? pb.authStore.record : null

export default pb
