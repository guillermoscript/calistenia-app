import { generateText, generateObject, Output, tool, stepCountIs } from "ai";
import { z } from "zod";
import { MealAnalysisSchema, QualityBlockSchema } from "./schemas.js";
import { resolveModel, resolveWebSearchTool, type Tier } from "./model-resolver.js";
import { getPromptWithMeta } from "./prompts.js";

interface ImageInput {
  buffer: Buffer;
  mimeType: string;
}

export interface UserContext {
  goal?: string;
  remainingMacros?: { calories: number; protein: number; carbs: number; fat: number };
  recentScores?: { mealType: string; score: string; loggedAt: string }[];
  topFoods?: string[];
  logHour?: number;
}

interface MealAnalysisInput {
  images: ImageInput[];
  mealType: string;
  description?: string;
  tier: Tier;
  userContext?: UserContext;
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
  completeness?: number;
  nutrition_grade_fr?: string;
}

/** Score product data quality: prefer complete nutritional data */
function dataQualityScore(p: OFFProduct): number {
  let score = 0;
  const n = p.nutriments;
  if (!n) return 0;
  if (n["energy-kcal_100g"] != null && n["energy-kcal_100g"] > 0) score += 3;
  if (n.proteins_100g != null && n.proteins_100g >= 0) score += 2;
  if (n.carbohydrates_100g != null && n.carbohydrates_100g >= 0) score += 2;
  if (n.fat_100g != null && n.fat_100g >= 0) score += 2;
  if (n.fiber_100g != null) score += 1;
  if (p.completeness && p.completeness > 0.5) score += 1;
  if (p.product_name_es) score += 1; // prefer Spanish-named products
  return score;
}

async function searchOpenFoodFacts(
  query: string,
  locale = "es"
): Promise<OFFProduct[]> {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&json=1&page_size=10&lc=${locale}&fields=product_name,product_name_es,brands,serving_size,nutriments,completeness,nutrition_grade_fr`;
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
        .sort((a, b) => dataQualityScore(b) - dataQualityScore(a))
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

// ── Main analyzer ────────────────────────────────────────────────────────────

function buildUserContextBlock(ctx: UserContext): string {
  const lines: string[] = ["\n\n## Contexto del usuario para evaluación de calidad"];
  if (ctx.goal) lines.push(`- Objetivo: ${ctx.goal}`);
  if (ctx.remainingMacros) {
    const r = ctx.remainingMacros;
    lines.push(`- Macros restantes hoy: ${r.calories}kcal, ${r.protein}g prot, ${r.carbs}g carbs, ${r.fat}g grasa`);
  }
  if (ctx.logHour != null) lines.push(`- Hora del registro: ${ctx.logHour}:00`);
  if (ctx.recentScores?.length) {
    const recent = ctx.recentScores.slice(0, 7).map(s => `${s.mealType}:${s.score}`).join(", ");
    lines.push(`- Scores recientes (últimas comidas): ${recent}`);
  }
  if (ctx.topFoods?.length) {
    lines.push(`- Alimentos frecuentes del usuario: ${ctx.topFoods.slice(0, 10).join(", ")}`);
  }
  lines.push("\nEvalúa la calidad de esta comida considerando todo el contexto anterior. Incluye el bloque 'quality' en tu respuesta.");
  return lines.join("\n");
}

export async function analyzeMealImage({
  images,
  mealType,
  description,
  tier,
  userContext,
}: MealAnalysisInput) {
  const { model, name: modelName, provider } = resolveModel(tier);
  const webSearchTools = resolveWebSearchTool(provider);
  const { prompt: systemPrompt, langfusePrompt } = await getPromptWithMeta("meal-analyzer");

  let userText =
    images.length > 1
      ? `Analiza estas ${images.length} imagenes de ${mealType}. Las imagenes muestran la misma comida desde diferentes angulos o diferentes platos de la misma comida. Identifica todos los alimentos visibles en todas las imagenes y proporciona el desglose nutricional completo. No dupliques alimentos que aparezcan en varias fotos.`
      : `Analiza esta imagen de ${mealType}. Identifica todos los alimentos visibles y proporciona el desglose nutricional completo.`;

  if (description) {
    userText += `\n\nEl usuario describe la comida asi: "${description}"\nIMPORTANTE: Si el usuario menciona cantidades especificas (ej: "200g de pollo", "2 huevos"), PRIORIZA esas cantidades sobre tu estimacion visual. Usa la descripcion para identificar ingredientes no visibles en la foto (aceite, condimentos, salsas, etc.) e incluyelos como alimentos separados.`;
  }

  if (userContext) {
    userText += buildUserContextBlock(userContext);
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
    stopWhen: stepCountIs(10),
    experimental_telemetry: {
      isEnabled: true,
      functionId: "meal-analyzer",
      metadata: { tier, modelName, ...(langfusePrompt && { langfusePrompt }) },
    },
    messages: [
      { role: "system", content: systemPrompt },
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

  // Post-processing: fix caloric consistency (P×4 + C×4 + F×9 ≈ kcal)
  if (output?.foods) {
    for (const food of output.foods) {
      const computedCal = Math.round(food.protein * 4 + food.carbs * 4 + food.fat * 9);
      const deviation = Math.abs(food.calories - computedCal) / Math.max(computedCal, 1);
      // If calories deviate >25% from macros, trust macros and recalculate calories
      if (deviation > 0.25 && computedCal > 0) {
        food.calories = computedCal;
      }
    }
    // Recalculate totals from individual foods
    output.totals = {
      calories: Math.round(output.foods.reduce((s, f) => s + f.calories, 0)),
      protein: Math.round(output.foods.reduce((s, f) => s + f.protein, 0) * 10) / 10,
      carbs: Math.round(output.foods.reduce((s, f) => s + f.carbs, 0) * 10) / 10,
      fat: Math.round(output.foods.reduce((s, f) => s + f.fat, 0) * 10) / 10,
    };
  }

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

// ── Text-only quality scorer (for manual/barcode entries) ───────────────────

interface ScoreMealQualityInput {
  foods: { name: string; calories: number; protein: number; carbs: number; fat: number }[];
  totals: { calories: number; protein: number; carbs: number; fat: number };
  mealType: string;
  tier: Tier;
  userContext?: UserContext;
}

export async function scoreMealQuality({
  foods,
  totals,
  mealType,
  tier,
  userContext,
}: ScoreMealQualityInput): Promise<z.infer<typeof QualityBlockSchema> | null> {
  try {
    const { model, name: modelName } = resolveModel(tier);
    const { prompt: systemPrompt } = await getPromptWithMeta("meal-quality-scorer");

    let userText = `Evalúa la calidad nutricional de esta comida (${mealType}):\n\n`;
    userText += `Alimentos:\n`;
    for (const f of foods) {
      userText += `- ${f.name}: ${f.calories}kcal, ${f.protein}g prot, ${f.carbs}g carbs, ${f.fat}g grasa\n`;
    }
    userText += `\nTotales: ${totals.calories}kcal, ${totals.protein}g prot, ${totals.carbs}g carbs, ${totals.fat}g grasa`;

    if (userContext) {
      userText += buildUserContextBlock(userContext);
    }

    const { object } = await generateObject({
      model,
      schema: QualityBlockSchema,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
      ],
      experimental_telemetry: {
        isEnabled: true,
        functionId: "meal-quality-scorer",
        metadata: { tier, modelName },
      },
    });

    return object;
  } catch (err) {
    console.error("[scoreMealQuality] failed:", err);
    return null;
  }
}
