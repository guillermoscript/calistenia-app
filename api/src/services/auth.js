import PocketBase from 'pocketbase'
import config from '../config/env.js'

/**
 * Custom error for authentication failures.
 * Carries an HTTP status code for the error handler.
 */
export class AuthError extends Error {
  /**
   * @param {string} message
   * @param {number} [status=401]
   */
  constructor(message, status = 401) {
    super(message)
    this.status = status
    this.name = 'AuthError'
  }
}

/**
 * Validate a PocketBase Bearer token and return the user record.
 *
 * @param {string | undefined} authHeader — The Authorization header value
 * @returns {Promise<import('pocketbase').RecordModel>} The authenticated user record
 * @throws {AuthError} If the token is missing, malformed, or expired
 */
export async function authenticateRequest(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthError('Token de autenticación requerido')
  }

  const token = authHeader.slice(7)
  const pb = new PocketBase(config.pocketbaseUrl)
  pb.authStore.save(token, null)

  try {
    const result = await pb.collection('users').authRefresh()
    return result.record
  } catch {
    throw new AuthError('Token inválido o expirado')
  }
}
