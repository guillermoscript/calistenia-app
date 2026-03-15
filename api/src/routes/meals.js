import { Router } from 'express'
import { imageUpload } from '../middleware/upload.js'
import { requireAuth } from '../middleware/auth.js'
import { rateLimit } from '../middleware/rate-limit.js'
import { analyzeMealImage } from '../services/meal-analyzer.js'

const router = Router()

/**
 * POST /api/analyze-meal
 *
 * Accepts a multipart form with:
 *   - `image` (file, required) — Photo of the meal
 *   - `meal_type` (string, optional) — 'desayuno' | 'almuerzo' | 'cena' | 'snack'
 *
 * Requires Bearer token (PocketBase auth).
 * Rate-limited per user.
 *
 * Returns structured nutrition data with per-food macros and totals.
 */
router.post(
  '/analyze-meal',
  requireAuth,
  rateLimit,
  imageUpload.single('image'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Se requiere una imagen de la comida' })
      }

      const mealType = req.body.meal_type || 'comida'
      const tier = req.user.tier || 'free'

      const result = await analyzeMealImage({
        imageBuffer: req.file.buffer,
        mimeType: req.file.mimetype,
        mealType,
        tier,
      })

      return res.json({
        meal_type: mealType,
        model_tier: tier,
        ...result,
      })
    } catch (err) {
      next(err)
    }
  },
)

export default router
