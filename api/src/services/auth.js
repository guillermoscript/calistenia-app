import PocketBase from 'pocketbase'
import config from '../config/env.js'

export class AuthError extends Error {
  constructor(message, status = 401) {
    super(message)
    this.status = status
    this.name = 'AuthError'
  }
}

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
