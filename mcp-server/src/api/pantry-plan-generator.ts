import { generateObject } from "ai";
import { z } from "zod";
import { resolveModel, type Tier } from "./model-resolver.js";
import { getPromptWithMeta } from "./prompts.js";
import { RecipeSchema, HowManyMealsSchema } from "./schemas.js";

const PantryPlannedMealSchema = z.object({
  meal_type: z.enum(["desayuno", "almuerzo", "cena", "snack"]),
  label: z.string(),
  description: z.string(),
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  recipe: RecipeSchema.nullable(),
});

const PantryDayPlanSchema = z.object({
  meals: z.array(PantryPlannedMealSchema),
  notes: z.string(),
});

const PantryWeekPlanSchema = z.object({
  days: z
    .array(
      z.object({
        day_index: z.number().describe("0 = lunes ... 6 = domingo"),
        meals: z.array(PantryPlannedMealSchema),
        notes: z.string(),
      })
    )
    .length(7),
});

export type PantryPlanHorizon = "day" | "week" | "how_many_meals";

export interface PantrySnapshotItem {
  name: string;
  name_normalized: string;
  category: string;
  quantity: number | null;
  unit: string | null;
  expiry_estimate: string | null;
}

export interface PantryPlanGoals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface PantryPlanInput {
  horizon: PantryPlanHorizon;
  pantryItems: PantrySnapshotItem[];
  goals: PantryPlanGoals | null;
  targetDate: string | null;
  tier: Tier;
}

const SCHEMA_BY_HORIZON: Record<PantryPlanHorizon, z.ZodTypeAny> = {
  day: PantryDayPlanSchema,
  week: PantryWeekPlanSchema,
  how_many_meals: HowManyMealsSchema,
};

function inventoryBlock(items: PantrySnapshotItem[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const lines = items.map((it) => {
    const qty = it.quantity != null ? `${it.quantity} ${it.unit ?? ""}`.trim() : "cantidad desconocida";
    const exp = it.expiry_estimate ? ` (vence ~${it.expiry_estimate})` : "";
    return `- ${it.name} [${it.category}]: ${qty}${exp}`;
  });
  return `Hoy es ${today}. Inventario actual de la despensa:\n${lines.join("\n")}`;
}

function goalsBlock(goals: PantryPlanGoals | null): string {
  if (!goals) return "El usuario no tiene metas de macros configuradas: apunta a comidas balanceadas.";
  return `Metas diarias del usuario: ${goals.calories} kcal, ${goals.protein}g proteína, ${goals.carbs}g carbohidratos, ${goals.fat}g grasa.`;
}

export async function generatePantryPlan({ horizon, pantryItems, goals, targetDate, tier }: PantryPlanInput) {
  const { model, name: modelName } = resolveModel(tier);
  const { prompt: systemPrompt, langfusePrompt } = await getPromptWithMeta("pantry-plan-generator");

  const modeLine =
    horizon === "day"
      ? `Genera el plan de comidas de UN día (${targetDate ?? "mañana"}): desayuno, almuerzo, cena y snack, cada uno con receta completa.`
      : horizon === "week"
        ? `Genera el plan de comidas de la SEMANA completa (7 días desde ${targetDate ?? "el lunes de esta semana"}), day_index 0=lunes...6=domingo, cada comida con receta completa.`
        : `Modo "¿cuántas comidas me alcanzan?": NO generes plan; estima cuántas comidas completas salen del inventario, desglose por tipo de comida y qué ingrediente limita cada una.`;

  const prompt = `${inventoryBlock(pantryItems)}\n\n${goalsBlock(goals)}\n\n${modeLine}`;

  const { object, usage } = await generateObject({
    model,
    schema: SCHEMA_BY_HORIZON[horizon],
    experimental_telemetry: {
      isEnabled: true,
      functionId: "pantry-plan-generator",
      metadata: { tier, modelName, horizon, ...(langfusePrompt && { langfusePrompt }) },
    },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ],
  });

  return {
    ...(object as Record<string, unknown>),
    model_used: modelName,
    usage: {
      prompt_tokens: (usage as any)?.promptTokens ?? (usage as any)?.prompt_tokens,
      completion_tokens: (usage as any)?.completionTokens ?? (usage as any)?.completion_tokens,
      total_tokens: (usage as any)?.totalTokens ?? (usage as any)?.total_tokens,
    },
  };
}
