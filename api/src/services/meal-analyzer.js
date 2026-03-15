import { generateText, Output } from 'ai'
import { MealAnalysisSchema } from '../schemas/meal.js'
import { resolveModel } from './model-resolver.js'

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
