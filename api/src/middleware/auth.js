import { authenticateRequest } from '../services/auth.js'

export async function requireAuth(req, _res, next) {
  try {
    req.user = await authenticateRequest(req.headers.authorization)
    next()
  } catch (err) {
    next(err)
  }
}
