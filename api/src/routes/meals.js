import { Router } from 'express'
import { imageUpload } from '../middleware/upload.js'
import { requireAuth } from '../middleware/auth.js'
import { rateLimit } from '../middleware/rate-limit.js'
import { analyzeMealImage } from '../services/meal-analyzer.js'

const router = Router()

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
