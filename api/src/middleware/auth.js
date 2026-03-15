import { authenticateRequest } from '../services/auth.js'

/**
 * Express middleware that validates the PocketBase Bearer token
 * and attaches the user record to `req.user`.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} _res
 * @param {import('express').NextFunction} next
 */
export async function requireAuth(req, _res, next) {
  try {
    req.user = await authenticateRequest(req.headers.authorization)
    next()
  } catch (err) {
    next(err)
  }
}
