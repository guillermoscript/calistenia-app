import { generateText, Output } from 'ai'
import { MealAnalysisSchema } from '../schemas/meal.js'
import { resolveModel } from './model-resolver.js'

/**
 * @typedef {Object} MealAnalysisInput
 * @property {Buffer} imageBuffer — Raw image bytes
 * @property {string} mimeType   — MIME type (e.g. 'image/jpeg')
 * @property {string} mealType   — Meal category ('desayuno', 'almuerzo', 'cena', 'snack')
 * @property {import('./model-resolver.js').Tier} tier — User pricing tier
 */

/**
 * @typedef {Object} MealAnalysisResult
 * @property {import('zod').infer<typeof MealAnalysisSchema>} analysis
 * @property {string} model_used — Model identifier that produced the result
 * @property {{ prompt_tokens?: number, completion_tokens?: number, total_tokens?: number }} usage
 */

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

/**
 * Analyze a meal image using the AI SDK and return structured nutrition data.
 *
 * Uses `generateText` with `Output.object()` (AI SDK v6 pattern).
 * The model is selected automatically based on the user's tier and available providers.
 *
 * @param {MealAnalysisInput} input
 * @returns {Promise<MealAnalysisResult>}
 * @throws {Error} On AI provider failures or missing configuration
 */
export async function analyzeMealImage({ imageBuffer, mimeType, mealType, tier }) {
  const { model, name: modelName } = resolveModel(tier)
  const imageBase64 = imageBuffer.toString('base64')

  const { output, usage } = await generateText({
    model,
    output: Output.object({ schema: MealAnalysisSchema }),
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'image', image: `data:${mimeType};base64,${imageBase64}` },
          { type: 'text', text: `Analiza esta imagen de ${mealType}. Identifica todos los alimentos visibles y proporciona el desglose nutricional completo.` },
        ],
      },
    ],
  })

  return {
    analysis: output,
    model_used: modelName,
    usage: {
      prompt_tokens: usage?.promptTokens,
      completion_tokens: usage?.completionTokens,
      total_tokens: usage?.totalTokens,
    },
  }
}
