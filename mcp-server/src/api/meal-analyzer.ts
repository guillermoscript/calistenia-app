import { generateText, Output } from "ai";
import { MealAnalysisSchema } from "./schemas.js";
import { resolveModel, type Tier } from "./model-resolver.js";

interface MealAnalysisInput {
  imageBuffer: Buffer;
  mimeType: string;
  mealType: string;
  tier: Tier;
}

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
- Responde siempre en español.`;

export async function analyzeMealImage({ imageBuffer, mimeType, mealType, tier }: MealAnalysisInput) {
  const { model, name: modelName } = resolveModel(tier);

  const { output, usage } = await generateText({
    model,
    output: Output.object({ schema: MealAnalysisSchema }),
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "image", image: new Uint8Array(imageBuffer), mimeType: mimeType as any },
          {
            type: "text",
            text: `Analiza esta imagen de ${mealType}. Identifica todos los alimentos visibles y proporciona el desglose nutricional completo.`,
          },
        ],
      },
    ],
  });

  return {
    analysis: output,
    model_used: modelName,
    usage: {
      prompt_tokens: (usage as any)?.promptTokens ?? (usage as any)?.prompt_tokens,
      completion_tokens: (usage as any)?.completionTokens ?? (usage as any)?.completion_tokens,
      total_tokens: (usage as any)?.totalTokens ?? (usage as any)?.total_tokens,
    },
  };
}
