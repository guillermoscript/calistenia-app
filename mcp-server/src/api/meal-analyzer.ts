import { generateText, Output, tool, stepCountIs } from "ai";
import { z } from "zod";
import { MealAnalysisSchema } from "./schemas.js";
import { resolveModel, resolveWebSearchTool, type Tier } from "./model-resolver.js";

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

// ── Food database API helpers ────────────────────────────────────────────────

interface OFFNutriments {
  "energy-kcal_100g"?: number;
  proteins_100g?: number;
  carbohydrates_100g?: number;
  fat_100g?: number;
  fiber_100g?: number;
  sugars_100g?: number;
  sodium_100g?: number;
}

interface OFFProduct {
  product_name_es?: string;
  product_name?: string;
  brands?: string;
  serving_size?: string;
  nutriments?: OFFNutriments;
}

async function searchOpenFoodFacts(
  query: string,
  locale = "es"
): Promise<OFFProduct[]> {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&json=1&page_size=5&lc=${locale}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) return [];
  const data = await res.json();
  return data.products ?? [];
}

// ── Tool: search Open Food Facts for real nutritional data ───────────────────

const searchFoodDatabase = tool({
  description:
    "Busca alimentos en Open Food Facts para obtener datos nutricionales reales por cada 100g. " +
    "Usa esto para fundamentar tu análisis con valores verificados de una base de datos pública. " +
    "Busca cada alimento identificado en la imagen para obtener valores precisos de calorías, proteína, carbohidratos y grasa.",
  inputSchema: z.object({
    queries: z
      .array(z.string())
      .min(1)
      .max(10)
      .describe(
        "Lista de nombres de alimentos a buscar (ej: ['pechuga de pollo', 'arroz blanco', 'aguacate'])"
      ),
  }),
  execute: async ({ queries }) => {
    const results: Array<{
      query: string;
      matches: Array<{
        name: string;
        brand?: string;
        serving_size?: string;
        per_100g: {
          calories: number;
          protein: number;
          carbs: number;
          fat: number;
          fiber?: number;
        };
      }>;
    }> = [];

    // Search all queries in parallel
    const searches = await Promise.allSettled(
      queries.map((q) => searchOpenFoodFacts(q))
    );

    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      const result = searches[i];
      const products =
        result.status === "fulfilled" ? result.value : [];

      const matches = products
        .filter((p) => p.nutriments?.["energy-kcal_100g"] != null)
        .slice(0, 3)
        .map((p) => ({
          name: p.product_name_es || p.product_name || query,
          brand: p.brands || undefined,
          serving_size: p.serving_size || undefined,
          per_100g: {
            calories: Math.round(p.nutriments!["energy-kcal_100g"] ?? 0),
            protein: Math.round((p.nutriments!.proteins_100g ?? 0) * 10) / 10,
            carbs:
              Math.round((p.nutriments!.carbohydrates_100g ?? 0) * 10) / 10,
            fat: Math.round((p.nutriments!.fat_100g ?? 0) * 10) / 10,
            fiber: p.nutriments!.fiber_100g
              ? Math.round(p.nutriments!.fiber_100g * 10) / 10
              : undefined,
          },
        }));

      results.push({ query, matches });
    }

    const totalFound = results.reduce((s, r) => s + r.matches.length, 0);
    return {
      found: results,
      message:
        totalFound > 0
          ? `Se encontraron ${totalFound} productos en Open Food Facts. Los valores son por cada 100g — multiplica por el peso estimado de la porción visible.`
          : "No se encontraron productos en Open Food Facts. Usa web_search/google_search para buscar datos nutricionales, o tablas estándar.",
    };
  },
});

// ── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres un nutricionista experto especializado en análisis visual de comidas.
Analiza la imagen de la comida proporcionada y devuelve información nutricional detallada.

## Flujo de trabajo

1. PRIMERO: Observa la imagen e identifica todos los alimentos visibles.
2. SEGUNDO: Usa la herramienta search_food_database para buscar esos alimentos en Open Food Facts. Esto te dará valores nutricionales reales por cada 100g de producto.
3. TERCERO: Si no encontraste datos suficientes en Open Food Facts para algún alimento, usa web_search/google_search para buscar sus valores nutricionales en la web.
4. CUARTO: Genera tu análisis final combinando lo que ves en la imagen con los datos reales encontrados. Calcula los valores finales multiplicando los datos por 100g por el peso estimado de cada porción visible.

## Instrucciones de análisis

- Identifica cada alimento visible en la imagen.
- Estima el tamaño de la porción con PRECISION REALISTA basándote en el tamaño visual. NUNCA uses valores redondeados a 50g (50g, 100g, 150g, 200g, 250g, 300g). Usa estimaciones precisas como 175g, 185g, 220g, 135g, 280g, 115g. Un filete de pollo mediano pesa ~185g, no "200g". Un plato de arroz normal ~165g, no "150g".
- Incluye una portionNote breve describiendo como estimaste la porcion (ej: "filete mediano", "taza llena", "puñado grande").
- Calcula los valores nutricionales (calorías, proteína, carbohidratos, grasa) para cada alimento. Si tienes datos de Open Food Facts, multiplica los valores por 100g por el peso estimado de la porción.
- Los totales DEBEN ser la suma exacta de los valores individuales de cada alimento.
- Usa valores realistas — no redondees excesivamente.
- Si no puedes identificar un alimento con certeza, haz tu mejor estimación y marca la confianza como "low".
- Si el alimento es claramente identificable, marca la confianza como "high".
- Proporciona una breve descripción general de la comida.
- Incluye ingredientes no visibles pero probables (aceite de coccion, sal, condimentos) como alimentos separados si aportan calorias significativas.
- Responde siempre en español.`;

// ── Main analyzer ────────────────────────────────────────────────────────────

export async function analyzeMealImage({
  images,
  mealType,
  description,
  tier,
}: MealAnalysisInput) {
  const { model, name: modelName, provider } = resolveModel(tier);
  const webSearchTools = resolveWebSearchTool(provider);

  let userText =
    images.length > 1
      ? `Analiza estas ${images.length} imagenes de ${mealType}. Las imagenes muestran la misma comida desde diferentes angulos o diferentes platos de la misma comida. Identifica todos los alimentos visibles en todas las imagenes y proporciona el desglose nutricional completo. No dupliques alimentos que aparezcan en varias fotos.`
      : `Analiza esta imagen de ${mealType}. Identifica todos los alimentos visibles y proporciona el desglose nutricional completo.`;

  if (description) {
    userText += `\n\nEl usuario describe la comida asi: "${description}"\nIMPORTANTE: Si el usuario menciona cantidades especificas (ej: "200g de pollo", "2 huevos"), PRIORIZA esas cantidades sobre tu estimacion visual. Usa la descripcion para identificar ingredientes no visibles en la foto (aceite, condimentos, salsas, etc.) e incluyelos como alimentos separados.`;
  }

  const imageContent = images.map((img) => ({
    type: "image" as const,
    image: new Uint8Array(img.buffer),
    mediaType: img.mimeType as any,
  }));

  const { output, steps } = await generateText({
    model,
    output: Output.object({ schema: MealAnalysisSchema }),
    tools: { search_food_database: searchFoodDatabase, ...webSearchTools },
    stopWhen: stepCountIs(7),
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [...imageContent, { type: "text", text: userText }],
      },
    ],
  });

  // Compute total usage across all steps
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
    analysis: output,
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
