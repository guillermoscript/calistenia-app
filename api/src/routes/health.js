import { Router } from 'express'
import { getAvailableProviders } from '../services/model-resolver.js'

const router = Router()

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    providers: getAvailableProviders(),
  })
})

export default router
