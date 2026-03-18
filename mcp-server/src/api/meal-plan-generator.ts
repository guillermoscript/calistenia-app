import { generateObject } from "ai";
import { z } from "zod";
import { resolveModel, type Tier } from "./model-resolver.js";

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

interface MealPlanInput {
  remainingCalories: number;
  remainingProtein: number;
  remainingCarbs: number;
  remainingFat: number;
  loggedMealTypes: string[];
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
    messages: [
      { role: "system", content: "Nutricionista experto. Respuestas concisas en español." },
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
