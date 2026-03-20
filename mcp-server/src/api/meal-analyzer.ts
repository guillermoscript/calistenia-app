import { generateText, Output } from "ai";
import { MealAnalysisSchema } from "./schemas.js";
import { resolveModel, type Tier } from "./model-resolver.js";

interface ImageInput {
  buffer: Buffer;
  mimeType: string;
}

interface MealAnalysisInput {
  images: ImageInput[];
  mealType: string;
  description?: string;
  tier: Tier;
}

const SYSTEM_PROMPT = `Eres un nutricionista experto especializado en análisis visual de comidas.
Analiza la imagen de la comida proporcionada y devuelve información nutricional detallada.

Instrucciones:
- Identifica cada alimento visible en la imagen.
- Estima el tamaño de la porción con PRECISION REALISTA basándote en el tamaño visual. NUNCA uses valores redondeados a 50g (50g, 100g, 150g, 200g, 250g, 300g). Usa estimaciones precisas como 175g, 185g, 220g, 135g, 280g, 115g. Un filete de pollo mediano pesa ~185g, no "200g". Un plato de arroz normal ~165g, no "150g".
- Incluye una portionNote breve describiendo como estimaste la porcion (ej: "filete mediano", "taza llena", "puñado grande").
- Calcula los valores nutricionales (calorías, proteína, carbohidratos, grasa) para cada alimento usando tablas nutricionales estándar.
- Los totales DEBEN ser la suma exacta de los valores individuales de cada alimento.
- Usa valores realistas — no redondees excesivamente.
- Si no puedes identificar un alimento con certeza, haz tu mejor estimación y marca la confianza como "low".
- Si el alimento es claramente identificable, marca la confianza como "high".
- Proporciona una breve descripción general de la comida.
- Incluye ingredientes no visibles pero probables (aceite de coccion, sal, condimentos) como alimentos separados si aportan calorias significativas.
- Responde siempre en español.`;

export async function analyzeMealImage({ images, mealType, description, tier }: MealAnalysisInput) {
  const { model, name: modelName } = resolveModel(tier);

  let userText = images.length > 1
    ? `Analiza estas ${images.length} imagenes de ${mealType}. Las imagenes muestran la misma comida desde diferentes angulos o diferentes platos de la misma comida. Identifica todos los alimentos visibles en todas las imagenes y proporciona el desglose nutricional completo. No dupliques alimentos que aparezcan en varias fotos.`
    : `Analiza esta imagen de ${mealType}. Identifica todos los alimentos visibles y proporciona el desglose nutricional completo.`;
  if (description) {
    userText += `\n\nEl usuario describe la comida asi: "${description}"\nIMPORTANTE: Si el usuario menciona cantidades especificas (ej: "200g de pollo", "2 huevos"), PRIORIZA esas cantidades sobre tu estimacion visual. Usa la descripcion para identificar ingredientes no visibles en la foto (aceite, condimentos, salsas, etc.) e incluyelos como alimentos separados.`;
  }

  const imageContent = images.map(img => ({
    type: "image" as const,
    image: new Uint8Array(img.buffer),
    mediaType: img.mimeType as any,
  }));

  const { output, usage } = await generateText({
    model,
    output: Output.object({ schema: MealAnalysisSchema }),
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          ...imageContent,
          { type: "text", text: userText },
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
