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
 * OAuth2 con Google (o cualquier provider configurado en PocketBase).
 * After login, if the user has no avatar yet, fetches their Google profile picture
 * and uploads it to PocketBase.
 */
export const loginWithOAuth2 = async (provider: string): Promise<RecordAuthResponse<RecordModel>> => {
  const result = await pb.collection('users').authWithOAuth2({ provider })

  // If user has no avatar and OAuth provided an avatarURL, download and upload it
  if (!result.record.avatar && result.meta?.avatarURL) {
    try {
      const response = await fetch(result.meta.avatarURL)
      if (response.ok) {
        const blob = await response.blob()
        const ext = blob.type === 'image/png' ? 'png' : 'jpg'
        const file = new File([blob], `google-avatar.${ext}`, { type: blob.type })

        const formData = new FormData()
        formData.append('avatar', file)

        await pb.collection('users').update(result.record.id, formData)
        // Refresh auth to get updated record with avatar
        await pb.collection('users').authRefresh()
      }
    } catch (e) {
      console.warn('Failed to fetch Google avatar:', e)
    }
  }

  return result
}

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

/**
 * Returns the URL for a user's avatar thumbnail, or null if no avatar.
 */
export const getUserAvatarUrl = (user: RecordModel, thumb: string = '200x200'): string | null => {
  if (!user.avatar) return null
  return pb.files.getUrl(user, user.avatar, { thumb })
}

export default pb
