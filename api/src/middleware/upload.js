import multer from 'multer'
import config from '../config/env.js'

/**
 * Multer middleware configured for in-memory image uploads.
 *
 * - Max size: `UPLOAD_MAX_SIZE_MB` env var (default 10 MB)
 * - Allowed types: JPEG, PNG, WebP, GIF
 */
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.upload.maxSizeMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (config.upload.allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error(`Tipo de archivo no soportado: ${file.mimetype}`))
    }
  },
})
