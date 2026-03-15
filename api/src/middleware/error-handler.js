import multer from 'multer'
import { AuthError } from '../services/auth.js'

/**
 * Centralized Express error handler.
 *
 * Handles known error types with appropriate HTTP status codes:
 *  - AuthError       → 401
 *  - MulterError     → 400/413
 *  - ZodError        → 422
 *  - AI SDK errors   → 502
 *  - Everything else → 500
 *
 * @param {Error & { status?: number }} err
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 */
export function errorHandler(err, _req, res, _next) {
  if (err instanceof AuthError) {
    return res.status(err.status).json({ error: err.message })
  }

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'La imagen excede el tamaño máximo permitido' })
    }
    return res.status(400).json({ error: `Error al procesar archivo: ${err.message}` })
  }

  if (err.name === 'ZodError') {
    return res.status(422).json({ error: 'Datos inválidos', details: err.issues })
  }

  // AI SDK specific errors (network, parsing, rate limits from provider)
  if (err.name?.startsWith('AI_')) {
    console.error('[ai-error]', err.name, err.message)
    return res.status(502).json({ error: 'Error al comunicarse con el servicio de IA. Intenta de nuevo.' })
  }

  console.error('[unhandled-error]', err.message || err)
  return res.status(err.status || 500).json({
    error: err.status ? err.message : 'Error interno del servidor',
  })
}
