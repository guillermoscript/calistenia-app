import express from 'express'
import cors from 'cors'
import multer from 'multer'
import { generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
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
  name: z.string().describe('Nombre del alimento'),
  portion: z.string().describe('Tamaño de la porción (ej: "100g", "1 unidad")'),
  calories: z.number().describe('Calorías (kcal)'),
  protein: z.number().describe('Proteína (g)'),
  carbs: z.number().describe('Carbohidratos (g)'),
  fat: z.number().describe('Grasa (g)'),
})

const MealAnalysisSchema = z.object({
  foods: z.array(FoodItemSchema).describe('Lista de alimentos detectados'),
  totals: z.object({
    calories: z.number().describe('Total de calorías (kcal)'),
    protein: z.number().describe('Total de proteína (g)'),
    carbs: z.number().describe('Total de carbohidratos (g)'),
    fat: z.number().describe('Total de grasa (g)'),
  }).describe('Totales nutricionales de la comida'),
})

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `Eres un nutricionista experto especializado en análisis visual de comidas.
Analiza la imagen de la comida proporcionada y devuelve información nutricional detallada.

Instrucciones:
- Identifica cada alimento visible en la imagen.
- Estima el tamaño de la porción de forma realista.
- Calcula los valores nutricionales (calorías, proteína, carbohidratos, grasa) para cada alimento.
- Proporciona los totales sumados correctamente.
- Usa valores realistas basados en tablas nutricionales estándar.
- Si no puedes identificar un alimento con certeza, haz tu mejor estimación e indícalo en el nombre.
- Responde siempre en español.`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve the AI model based on user tier. */
function getModel(tier) {
  switch (tier) {
    case 'pro':
      return anthropic('claude-sonnet-4-20250514')
    default:
      return anthropic('claude-haiku-4-5-20241022')
  }
}

/**
 * Validate the PocketBase auth token and return the user record.
 * Throws on invalid / expired tokens.
 */
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
    // authRefresh validates the token and returns the fresh user record
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

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Analyze meal image
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

    // 4. Build the image content for the AI
    const imageBase64 = req.file.buffer.toString('base64')
    const mimeType = req.file.mimetype

    // 5. Call AI with structured output
    const { object } = await generateObject({
      model,
      schema: MealAnalysisSchema,
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
              image: imageBase64,
              mimeType,
            },
            {
              type: 'text',
              text: `Analiza esta imagen de ${mealType}. Identifica todos los alimentos y proporciona el desglose nutricional completo.`,
            },
          ],
        },
      ],
    })

    // 6. Return structured response
    return res.json({
      meal_type: mealType,
      analysis: object,
      model_tier: tier,
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
})
