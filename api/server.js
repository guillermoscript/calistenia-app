import express from 'express'
import cors from 'cors'
import multer from 'multer'
import { generateText, Output } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { google } from '@ai-sdk/google'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import PocketBase from 'pocketbase'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 3001
const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090'

// Multer — keep uploaded images in memory (max 10 MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (allowed.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error(`Tipo de archivo no soportado: ${file.mimetype}`))
    }
  },
})

// ---------------------------------------------------------------------------
// Zod schema for the structured AI response
// ---------------------------------------------------------------------------

const FoodItemSchema = z.object({
  name: z.string().describe('Nombre del alimento en español'),
  portion: z.string().describe('Tamaño de la porción estimada (ej: "150g", "1 unidad", "200ml")'),
  calories: z.number().describe('Calorías estimadas (kcal)'),
  protein: z.number().describe('Proteína estimada (g)'),
  carbs: z.number().describe('Carbohidratos estimados (g)'),
  fat: z.number().describe('Grasa estimada (g)'),
  confidence: z.enum(['high', 'medium', 'low']).describe('Confianza en la identificación del alimento'),
})

const MealAnalysisSchema = z.object({
  foods: z.array(FoodItemSchema).describe('Lista de alimentos detectados en la imagen'),
  totals: z.object({
    calories: z.number().describe('Suma total de calorías (kcal)'),
    protein: z.number().describe('Suma total de proteína (g)'),
    carbs: z.number().describe('Suma total de carbohidratos (g)'),
    fat: z.number().describe('Suma total de grasa (g)'),
  }).describe('Totales nutricionales sumados de todos los alimentos'),
  meal_description: z.string().describe('Breve descripción de la comida en español (1-2 oraciones)'),
})

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `Eres un nutricionista experto especializado en análisis visual de comidas.
Analiza la imagen de la comida proporcionada y devuelve información nutricional detallada.

Instrucciones:
- Identifica cada alimento visible en la imagen.
- Estima el tamaño de la porción de forma realista basándote en el tamaño visual.
- Calcula los valores nutricionales (calorías, proteína, carbohidratos, grasa) para cada alimento usando tablas nutricionales estándar.
- Los totales DEBEN ser la suma exacta de los valores individuales de cada alimento.
- Usa valores realistas — no redondees excesivamente.
- Si no puedes identificar un alimento con certeza, haz tu mejor estimación y marca la confianza como "low".
- Si el alimento es claramente identificable, marca la confianza como "high".
- Proporciona una breve descripción general de la comida.
- Responde siempre en español.`

// ---------------------------------------------------------------------------
// Model selection by tier
// ---------------------------------------------------------------------------

// Model priority: tries the first available provider based on env vars
function getModel(tier) {
  if (tier === 'pro') {
    // Pro tier: best available model
    if (process.env.ANTHROPIC_API_KEY) return anthropic('claude-sonnet-4-6')
    if (process.env.OPENAI_API_KEY) return openai('gpt-4o')
    if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) return google('gemini-2.5-pro')
  }

  // Free tier: cheapest fast model
  if (process.env.ANTHROPIC_API_KEY) return anthropic('claude-haiku-4-5')
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) return google('gemini-2.5-flash')
  if (process.env.OPENAI_API_KEY) return openai('gpt-4.1-mini')

  throw new Error('No AI provider API key configured. Set ANTHROPIC_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, or OPENAI_API_KEY.')
}

function getModelName(tier) {
  if (tier === 'pro') {
    if (process.env.ANTHROPIC_API_KEY) return 'claude-sonnet-4-6'
    if (process.env.OPENAI_API_KEY) return 'gpt-4o'
    if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) return 'gemini-2.5-pro'
  }
  if (process.env.ANTHROPIC_API_KEY) return 'claude-haiku-4-5'
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) return 'gemini-2.5-flash'
  if (process.env.OPENAI_API_KEY) return 'gpt-4.1-mini'
  return 'unknown'
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

async function authenticateRequest(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const err = new Error('Token de autenticación requerido')
    err.status = 401
    throw err
  }

  const token = authHeader.slice(7)
  const pb = new PocketBase(POCKETBASE_URL)
  pb.authStore.save(token, null)

  try {
    const result = await pb.collection('users').authRefresh()
    return result.record
  } catch {
    const err = new Error('Token inválido o expirado')
    err.status = 401
    throw err
  }
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express()
app.use(cors())
app.use(express.json())

// Health check — also reports which AI providers are configured
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    providers: {
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      google: !!process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      openai: !!process.env.OPENAI_API_KEY,
    },
  })
})

// Analyze meal image — AI SDK v6 with Output.object()
app.post('/api/analyze-meal', upload.single('image'), async (req, res) => {
  try {
    // 1. Authenticate
    const user = await authenticateRequest(req.headers.authorization)

    // 2. Validate input
    if (!req.file) {
      return res.status(400).json({ error: 'Se requiere una imagen de la comida' })
    }

    const mealType = req.body.meal_type || 'comida'

    // 3. Determine model based on user tier
    const tier = user.tier || 'free'
    const model = getModel(tier)
    const modelName = getModelName(tier)

    // 4. Build the image content
    const imageBase64 = req.file.buffer.toString('base64')
    const mimeType = req.file.mimetype

    // 5. Call AI with structured output (AI SDK v6 pattern)
    const { output, usage } = await generateText({
      model,
      output: Output.object({ schema: MealAnalysisSchema }),
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: [
            {
              type: 'image',
              image: `data:${mimeType};base64,${imageBase64}`,
            },
            {
              type: 'text',
              text: `Analiza esta imagen de ${mealType}. Identifica todos los alimentos visibles y proporciona el desglose nutricional completo.`,
            },
          ],
        },
      ],
    })

    // 6. Return structured response
    return res.json({
      meal_type: mealType,
      analysis: output,
      model_used: modelName,
      model_tier: tier,
      usage: {
        prompt_tokens: usage?.promptTokens,
        completion_tokens: usage?.completionTokens,
        total_tokens: usage?.totalTokens,
      },
    })
  } catch (err) {
    console.error('[analyze-meal] Error:', err.message || err)

    const status = err.status || 500
    const message = status === 500
      ? 'Error interno al analizar la comida'
      : err.message

    return res.status(status).json({ error: message })
  }
})

// Global error handler (catches multer errors, etc.)
app.use((err, _req, res, _next) => {
  console.error('[global-error]', err.message || err)

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'La imagen excede el tamaño máximo de 10 MB' })
    }
    return res.status(400).json({ error: `Error al procesar archivo: ${err.message}` })
  }

  const status = err.status || 500
  return res.status(status).json({ error: err.message || 'Error interno del servidor' })
})

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`AI API server running on port ${PORT}`)
  console.log(`PocketBase URL: ${POCKETBASE_URL}`)
  console.log(`Providers: Anthropic=${!!process.env.ANTHROPIC_API_KEY}, Google=${!!process.env.GOOGLE_GENERATIVE_AI_API_KEY}, OpenAI=${!!process.env.OPENAI_API_KEY}`)
})
