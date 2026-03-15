import { Router } from 'express'
import config from '../config/env.js'
import { getAvailableProviders } from '../services/model-resolver.js'

const router = Router()

/**
 * GET /api/health
 *
 * Returns service status, configured providers, and default model settings.
 * Used by Docker HEALTHCHECK and monitoring.
 */
router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    providers: getAvailableProviders(),
    defaults: {
      provider: config.defaultProvider || 'auto',
      model_free: config.defaultModelFree || 'auto',
      model_pro: config.defaultModelPro || 'auto',
    },
  })
})

export default router
