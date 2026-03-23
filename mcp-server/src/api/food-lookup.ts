import { generateText, Output, tool, stepCountIs } from "ai";
import { z } from "zod";
import { FoodItemSchema } from "./schemas.js";
import { resolveModel, resolveWebSearchTool, type Tier } from "./model-resolver.js";
import { getPromptWithMeta } from "./prompts.js";

interface FoodLookupInput {
  foodName: string;
  tier: Tier;
}

// ── Open Food Facts search ──────────────────────────────────────────────────

async function searchOpenFoodFacts(query: string): Promise<Array<{
  name: string;
  brand?: string;
  per_100g: { calories: number; protein: number; carbs: number; fat: number; fiber?: number };
}>> {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&json=1&page_size=5&lc=es`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.products ?? [])
      .filter((p: any) => p.nutriments?.["energy-kcal_100g"] != null)
      .slice(0, 3)
      .map((p: any) => ({
        name: p.product_name_es || p.product_name || query,
        brand: p.brands || undefined,
        per_100g: {
          calories: Math.round(p.nutriments["energy-kcal_100g"] ?? 0),
          protein: Math.round((p.nutriments.proteins_100g ?? 0) * 10) / 10,
          carbs: Math.round((p.nutriments.carbohydrates_100g ?? 0) * 10) / 10,
          fat: Math.round((p.nutriments.fat_100g ?? 0) * 10) / 10,
          fiber: p.nutriments.fiber_100g
            ? Math.round(p.nutriments.fiber_100g * 10) / 10
            : undefined,
        },
      }));
  } catch {
    return [];
  }
}

// ── Tool: search food database ──────────────────────────────────────────────

const searchFoodDatabase = tool({
  description:
    "Busca alimentos en Open Food Facts para obtener datos nutricionales reales por cada 100g. " +
    "Usa esto SIEMPRE para fundamentar tu respuesta con datos verificados.",
  inputSchema: z.object({
    query: z.string().describe("Nombre del alimento a buscar (ej: 'pechuga de pollo')"),
  }),
  execute: async ({ query }) => {
    const results = await searchOpenFoodFacts(query);

    return {
      matches: results,
      message:
        results.length > 0
          ? `Encontrados ${results.length} resultados en Open Food Facts. Valores por cada 100g.`
          : "No se encontraron resultados en Open Food Facts. Usa web_search/google_search o tablas nutricionales estándar.",
    };
  },
});

// ── Main lookup ─────────────────────────────────────────────────────────────

export async function lookupFoodByName({ foodName, tier }: FoodLookupInput) {
  const { model, name: modelName, provider } = resolveModel(tier);
  const webSearchTools = resolveWebSearchTool(provider);
  const { prompt: systemPrompt, langfusePrompt } = await getPromptWithMeta("food-lookup");

  const { output, steps } = await generateText({
    model,
    output: Output.object({ schema: FoodItemSchema }),
    tools: { search_food_database: searchFoodDatabase, ...webSearchTools },
    stopWhen: stepCountIs(5),
    experimental_telemetry: {
      isEnabled: true,
      functionId: "food-lookup",
      metadata: { tier, modelName, foodName, ...(langfusePrompt && { langfusePrompt }) },
    },
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Proporciona la información nutricional para: "${foodName}"`,
      },
    ],
  });

  const totalUsage = steps.reduce(
    (acc, step) => ({
      promptTokens: acc.promptTokens + (step.usage?.inputTokens ?? 0),
      completionTokens: acc.completionTokens + (step.usage?.outputTokens ?? 0),
    }),
    { promptTokens: 0, completionTokens: 0 }
  );

  const toolCallCount = steps.reduce(
    (acc, step) => acc + (step.toolCalls?.length ?? 0),
    0
  );

  return {
    food: output,
    model_used: modelName,
    agent_steps: steps.length,
    tool_calls: toolCallCount,
    usage: {
      prompt_tokens: totalUsage.promptTokens,
      completion_tokens: totalUsage.completionTokens,
      total_tokens: totalUsage.promptTokens + totalUsage.completionTokens,
    },
  };
}
