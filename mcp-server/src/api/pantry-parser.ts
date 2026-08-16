import type { Tier } from "./model-resolver.js";
import { PantryParseSchema, MatchConsumptionSchema, ReceiptParseSchema } from "./schemas.js";
import { canonCurrency, sanitizeReceiptItems } from "./receipt-sanitizer.js";
import { runStructuredGeneration } from "./structured-generation.js";

interface PantryParseInput {
  text: string;
  existingItems: string[];
}

export async function parsePantryText({ text, existingItems }: PantryParseInput) {
  const inventoryBlock =
    existingItems.length > 0
      ? `Inventario actual (name_normalized): ${existingItems.join(", ")}`
      : "Inventario actual: vacío";

  // Solo parsing, barato: free tier siempre (decisión cerrada en #153/#170)
  const { object, modelName, usage } = await runStructuredGeneration({
    promptName: "pantry-parser",
    tier: "free",
    schema: PantryParseSchema,
    user: `${inventoryBlock}\n\nMensaje del usuario: ${text}`,
  });

  return {
    ...object,
    model_used: modelName,
    usage,
  };
}

interface MatchConsumptionInput {
  foods: { name: string; quantity?: number | null; unit?: string | null }[];
  pantryItems: { id: string; name_normalized: string; quantity: number | null; unit: string | null }[];
}

// #173 F4: matching barato → free tier siempre (misma decisión que el parser)
export async function matchConsumption({ foods, pantryItems }: MatchConsumptionInput) {
  const pantryBlock = pantryItems
    .map((it) => {
      const qty = it.quantity != null ? `${it.quantity} ${it.unit ?? ""}`.trim() : "cantidad desconocida";
      return `- id=${it.id} | ${it.name_normalized} | ${qty}`;
    })
    .join("\n");
  const foodsBlock = foods
    .map((f) => `- ${f.name}${f.quantity != null ? ` (${`${f.quantity} ${f.unit ?? ""}`.trim()})` : ""}`)
    .join("\n");

  const { object, modelName, usage } = await runStructuredGeneration({
    promptName: "pantry-consumption-matcher",
    tier: "free",
    schema: MatchConsumptionSchema,
    user: `Inventario de la despensa:\n${pantryBlock}\n\nComida logueada:\n${foodsBlock}`,
  });

  // Blindaje: ids alucinados fuera del inventario no llegan al cliente
  const validIds = new Set(pantryItems.map((it) => it.id));
  return {
    ...object,
    matches: object.matches.filter((m) => validIds.has(m.pantry_item_id)),
    model_used: modelName,
    usage,
  };
}

interface ReceiptParseInput {
  images: { buffer: Buffer; mimeType: string }[];
  tier: Tier;
}

// #174 F5: visión sobre recibo (borroso, abreviado) = tarea dura → tier del
// usuario, como analyze-meal. NO fijar "free" (eso es solo para parsing de texto).
export async function parseReceipt({ images, tier }: ReceiptParseInput) {
  const imageContent = images.map((img) => ({
    type: "image" as const,
    image: new Uint8Array(img.buffer),
    mediaType: img.mimeType as any,
  }));
  const userText =
    images.length > 1
      ? `Estas ${images.length} fotos son partes del MISMO recibo de supermercado (recibo largo). Extrae todos los items de comida con sus precios, sin duplicar los del solape entre fotos.`
      : "Extrae los items de comida y sus precios de esta foto de recibo de supermercado.";

  const { object, modelName, usage } = await runStructuredGeneration({
    promptName: "receipt-parser",
    tier,
    schema: ReceiptParseSchema,
    user: [...imageContent, { type: "text" as const, text: userText }],
  });

  // Post-proceso determinista: nombres limpios, name_normalized recalculado,
  // qty/unit rescatados, duplicados fusionados — no confiar en el LLM para esto.
  const sanitized = sanitizeReceiptItems(object.items, object.ignored_lines);

  return {
    ...object,
    currency: canonCurrency(object.currency),
    items: sanitized.items,
    ignored_lines: sanitized.ignored_lines,
    model_used: modelName,
    usage,
  };
}
