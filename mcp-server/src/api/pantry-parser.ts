import { generateObject } from "ai";
import { resolveModel, type Tier } from "./model-resolver.js";
import { getPromptWithMeta } from "./prompts.js";
import { PantryParseSchema, MatchConsumptionSchema, ReceiptParseSchema } from "./schemas.js";

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

interface MatchConsumptionInput {
  foods: { name: string; quantity?: number | null; unit?: string | null }[];
  pantryItems: { id: string; name_normalized: string; quantity: number | null; unit: string | null }[];
}

// #173 F4: matching barato → free tier siempre (misma decisión que el parser)
export async function matchConsumption({ foods, pantryItems }: MatchConsumptionInput) {
  const { model, name: modelName } = resolveModel("free");
  const { prompt: systemPrompt, langfusePrompt } = await getPromptWithMeta("pantry-consumption-matcher");

  const pantryBlock = pantryItems
    .map((it) => {
      const qty = it.quantity != null ? `${it.quantity} ${it.unit ?? ""}`.trim() : "cantidad desconocida";
      return `- id=${it.id} | ${it.name_normalized} | ${qty}`;
    })
    .join("\n");
  const foodsBlock = foods
    .map((f) => `- ${f.name}${f.quantity != null ? ` (${`${f.quantity} ${f.unit ?? ""}`.trim()})` : ""}`)
    .join("\n");

  const { object, usage } = await generateObject({
    model,
    schema: MatchConsumptionSchema,
    experimental_telemetry: {
      isEnabled: true,
      functionId: "pantry-consumption-matcher",
      metadata: { modelName, ...(langfusePrompt && { langfusePrompt }) },
    },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Inventario de la despensa:\n${pantryBlock}\n\nComida logueada:\n${foodsBlock}` },
    ],
  });

  // Blindaje: ids alucinados fuera del inventario no llegan al cliente
  const validIds = new Set(pantryItems.map((it) => it.id));
  return {
    ...object,
    matches: object.matches.filter((m) => validIds.has(m.pantry_item_id)),
    model_used: modelName,
    usage: {
      prompt_tokens: (usage as any)?.promptTokens ?? (usage as any)?.prompt_tokens,
      completion_tokens: (usage as any)?.completionTokens ?? (usage as any)?.completion_tokens,
      total_tokens: (usage as any)?.totalTokens ?? (usage as any)?.total_tokens,
    },
  };
}

interface ReceiptParseInput {
  images: { buffer: Buffer; mimeType: string }[];
  tier: Tier;
}

// #174 F5: visión sobre recibo (borroso, abreviado) = tarea dura → tier del
// usuario, como analyze-meal. NO fijar "free" (eso es solo para parsing de texto).
export async function parseReceipt({ images, tier }: ReceiptParseInput) {
  const { model, name: modelName } = resolveModel(tier);
  const { prompt: systemPrompt, langfusePrompt } = await getPromptWithMeta("receipt-parser");

  const imageContent = images.map((img) => ({
    type: "image" as const,
    image: new Uint8Array(img.buffer),
    mediaType: img.mimeType as any,
  }));
  const userText =
    images.length > 1
      ? `Estas ${images.length} fotos son partes del MISMO recibo de supermercado (recibo largo). Extrae todos los items de comida con sus precios, sin duplicar los del solape entre fotos.`
      : "Extrae los items de comida y sus precios de esta foto de recibo de supermercado.";

  const { object, usage } = await generateObject({
    model,
    schema: ReceiptParseSchema,
    experimental_telemetry: {
      isEnabled: true,
      functionId: "receipt-parser",
      metadata: { tier, modelName, ...(langfusePrompt && { langfusePrompt }) },
    },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: [...imageContent, { type: "text" as const, text: userText }] },
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
