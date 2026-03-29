import { generateObject } from "ai";
import { z } from "zod";
import { resolveModel, type Tier } from "./model-resolver.js";
import { getPromptWithMeta } from "./prompts.js";

const PlannedMealSchema = z.object({
  meal_type: z.enum(["desayuno", "almuerzo", "cena", "snack"]),
  label: z.string().describe("Nombre corto de la comida"),
  description: z.string().describe("Alimentos con porciones, ej: 'Pechuga 150g, arroz 200g, ensalada'"),
  calories: z.number().describe("Calorías totales (kcal)"),
  protein: z.number().describe("Proteína total (g)"),
  carbs: z.number().describe("Carbohidratos totales (g)"),
  fat: z.number().describe("Grasa total (g)"),
});

const MealPlanSchema = z.object({
  meals: z.array(PlannedMealSchema).describe("Comidas planificadas"),
  notes: z.string().describe("Consejo breve"),
});

const WeeklyDaySchema = z.object({
  day_index: z.number().describe("0=lunes, 1=martes, ..., 6=domingo"),
  meals: z.array(PlannedMealSchema).describe("4 comidas del día"),
  notes: z.string().describe("Consejo breve del día"),
});

const WeeklyMealPlanSchema = z.object({
  days: z.array(WeeklyDaySchema).length(7).describe("7 días de lunes a domingo"),
});

interface MealPlanInput {
  remainingCalories: number;
  remainingProtein: number;
  remainingCarbs: number;
  remainingFat: number;
  loggedMealTypes: string[];
  tier: Tier;
}

interface WeeklyMealPlanInput {
  dailyCalories: number;
  dailyProtein: number;
  dailyCarbs: number;
  dailyFat: number;
  goal: string;
  tier: Tier;
}

const MEAL_ORDER = ["desayuno", "almuerzo", "cena", "snack"];

export async function generateDailyMealPlan({
  remainingCalories,
  remainingProtein,
  remainingCarbs,
  remainingFat,
  loggedMealTypes,
  tier,
}: MealPlanInput) {
  const { model, name: modelName } = resolveModel(tier);
  const { prompt: systemPrompt, langfusePrompt } = await getPromptWithMeta("meal-plan-generator");

  const pendingMeals = MEAL_ORDER.filter((m) => !loggedMealTypes.includes(m));
  const pendingLabel =
    pendingMeals.length > 0
      ? pendingMeals.join(", ")
      : "snack o comida adicional";

  const prompt = `Diseña comidas para: ${pendingLabel}.
Macros restantes: ${remainingCalories}kcal, ${remainingProtein}g prot, ${remainingCarbs}g carbs, ${remainingFat}g grasa.
Usa alimentos comunes, porciones realistas, en español. Sé conciso.`;

  const { object, usage } = await generateObject({
    model,
    schema: MealPlanSchema,
    experimental_telemetry: {
      isEnabled: true,
      functionId: "meal-plan-generator",
      metadata: { tier, modelName, ...(langfusePrompt && { langfusePrompt }) },
    },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ],
  });

  return {
    meals: object.meals,
    notes: object.notes,
    model_used: modelName,
    usage: {
      prompt_tokens: (usage as any)?.promptTokens ?? (usage as any)?.prompt_tokens,
      completion_tokens: (usage as any)?.completionTokens ?? (usage as any)?.completion_tokens,
      total_tokens: (usage as any)?.totalTokens ?? (usage as any)?.total_tokens,
    },
  };
}

export async function generateWeeklyMealPlan({
  dailyCalories,
  dailyProtein,
  dailyCarbs,
  dailyFat,
  goal,
  tier,
}: WeeklyMealPlanInput) {
  const { model, name: modelName } = resolveModel(tier);
  const { prompt: systemPrompt, langfusePrompt } = await getPromptWithMeta("weekly-meal-plan-generator");

  const prompt = `Diseña un plan semanal (lunes a domingo) para una persona con objetivo: ${goal}.
Macros diarios objetivo: ${dailyCalories}kcal, ${dailyProtein}g prot, ${dailyCarbs}g carbs, ${dailyFat}g grasa.
Cada día debe tener 4 comidas (desayuno, almuerzo, cena, snack) que sumen los macros objetivo.
Asegura máxima variedad entre días. Usa alimentos comunes, porciones realistas, en español.`;

  const { object, usage } = await generateObject({
    model,
    schema: WeeklyMealPlanSchema,
    experimental_telemetry: {
      isEnabled: true,
      functionId: "weekly-meal-plan-generator",
      metadata: { tier, modelName, ...(langfusePrompt && { langfusePrompt }) },
    },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ],
  });

  return {
    days: object.days,
    model_used: modelName,
    usage: {
      prompt_tokens: (usage as any)?.promptTokens ?? (usage as any)?.prompt_tokens,
      completion_tokens: (usage as any)?.completionTokens ?? (usage as any)?.completion_tokens,
      total_tokens: (usage as any)?.totalTokens ?? (usage as any)?.total_tokens,
    },
  };
}
