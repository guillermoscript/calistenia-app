import multer from 'multer'
import { AuthError } from '../services/auth.js'

export function errorHandler(err, _req, res, _next) {
  // Known error types
  if (err instanceof AuthError) {
    return res.status(err.status).json({ error: err.message })
  }

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'La imagen excede el tamaño máximo permitido' })
    }
    return res.status(400).json({ error: `Error al procesar archivo: ${err.message}` })
  }

  // Zod validation errors
  if (err.name === 'ZodError') {
    return res.status(422).json({ error: 'Datos inválidos', details: err.issues })
  }

  // AI SDK errors
  if (err.name === 'AI_APICallError' || err.name === 'AI_NoObjectGeneratedError') {
    console.error('[ai-error]', err.message)
    return res.status(502).json({ error: 'Error al comunicarse con el servicio de IA. Intenta de nuevo.' })
  }

  // Fallback
  console.error('[unhandled-error]', err.message || err)
  return res.status(err.status || 500).json({
    error: err.status ? err.message : 'Error interno del servidor',
  })
}
