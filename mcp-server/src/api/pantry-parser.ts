import { generateObject } from "ai";
import { resolveModel } from "./model-resolver.js";
import { getPromptWithMeta } from "./prompts.js";
import { PantryParseSchema } from "./schemas.js";

interface PantryParseInput {
  text: string;
  existingItems: string[];
}

export async function parsePantryText({ text, existingItems }: PantryParseInput) {
  // Solo parsing, barato: free tier siempre (decisión cerrada en #153/#170)
  const { model, name: modelName } = resolveModel("free");
  const { prompt: systemPrompt, langfusePrompt } = await getPromptWithMeta("pantry-parser");

  const inventoryBlock =
    existingItems.length > 0
      ? `Inventario actual (name_normalized): ${existingItems.join(", ")}`
      : "Inventario actual: vacío";

  const { object, usage } = await generateObject({
    model,
    schema: PantryParseSchema,
    experimental_telemetry: {
      isEnabled: true,
      functionId: "pantry-parser",
      metadata: { modelName, ...(langfusePrompt && { langfusePrompt }) },
    },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `${inventoryBlock}\n\nMensaje del usuario: ${text}` },
    ],
  });

  return {
    ...object,
    model_used: modelName,
    usage: {
      prompt_tokens: (usage as any)?.promptTokens ?? (usage as any)?.prompt_tokens,
      completion_tokens: (usage as any)?.completionTokens ?? (usage as any)?.completion_tokens,
      total_tokens: (usage as any)?.totalTokens ?? (usage as any)?.total_tokens,
    },
  };
}
