import express from 'express'
import cors from 'cors'
import config from './src/config/env.js'
import healthRoutes from './src/routes/health.js'
import mealRoutes from './src/routes/meals.js'
import { errorHandler } from './src/middleware/error-handler.js'

const app = express()

// ── Global middleware ─────────────────────────────────────────────────────
app.use(cors())
app.use(express.json())

// ── Routes ────────────────────────────────────────────────────────────────
app.use('/api', healthRoutes)
app.use('/api', mealRoutes)

// ── Error handling ────────────────────────────────────────────────────────
app.use(errorHandler)

// ── Start ─────────────────────────────────────────────────────────────────
app.listen(config.port, () => {
  console.log(`AI API running on port ${config.port}`)
  console.log(`PocketBase: ${config.pocketbaseUrl}`)
  console.log(`Providers: Anthropic=${config.providers.anthropic}, Google=${config.providers.google}, OpenAI=${config.providers.openai}`)
})
