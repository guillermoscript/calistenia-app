import { generateText, Output } from "ai";
import { FoodItemSchema } from "./schemas.js";
import { resolveModel, type Tier } from "./model-resolver.js";

interface FoodLookupInput {
  foodName: string;
  tier: Tier;
}

const SYSTEM_PROMPT = `Eres un nutricionista experto. Proporciona información nutricional precisa y realista para un alimento.
- Usa valores estándar de tablas nutricionales reconocidas (USDA, FAO, etc.)
- La porción debe ser una cantidad típica de consumo (ej: "100g", "1 pechuga mediana (150g)", "1 vaso (250ml)")
- Los valores nutricionales deben corresponder exactamente a la porción indicada
- Responde siempre en español
- El campo "confidence" debe ser "high" si el alimento es conocido, "medium" si es estimado, "low" si hay ambigüedad`;

export async function lookupFoodByName({ foodName, tier }: FoodLookupInput) {
  const { model, name: modelName } = resolveModel(tier);

  const { output, usage } = await generateText({
    model,
    output: Output.object({ schema: FoodItemSchema }),
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Proporciona la información nutricional para: "${foodName}"`,
      },
    ],
  });

  return {
    food: output,
    model_used: modelName,
    usage: {
      prompt_tokens: (usage as any)?.promptTokens ?? (usage as any)?.prompt_tokens,
      completion_tokens:
        (usage as any)?.completionTokens ?? (usage as any)?.completion_tokens,
      total_tokens: (usage as any)?.totalTokens ?? (usage as any)?.total_tokens,
    },
  };
}
