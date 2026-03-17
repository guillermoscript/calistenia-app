import { generateText, Output } from "ai";
import { z } from "zod";
import { resolveModel, type Tier } from "./model-resolver.js";

const PlannedFoodSchema = z.object({
  name: z.string().describe("Nombre del alimento en español"),
  portion: z.string().describe('Porción (ej: "200g", "1 taza", "2 unidades")'),
  calories: z.number().describe("Calorías (kcal)"),
  protein: z.number().describe("Proteína (g)"),
  carbs: z.number().describe("Carbohidratos (g)"),
  fat: z.number().describe("Grasa (g)"),
});

const PlannedMealSchema = z.object({
  meal_type: z.enum(["desayuno", "almuerzo", "cena", "snack"]),
  label: z.string().describe("Nombre descriptivo de la comida"),
  foods: z.array(PlannedFoodSchema).describe("Lista de alimentos para esta comida"),
  total_calories: z.number().describe("Suma total de calorías de la comida"),
  total_protein: z.number().describe("Suma total de proteína"),
  total_carbs: z.number().describe("Suma total de carbohidratos"),
  total_fat: z.number().describe("Suma total de grasa"),
});

const MealPlanSchema = z.object({
  meals: z.array(PlannedMealSchema).describe("Lista de comidas planificadas para el resto del día"),
  notes: z.string().optional().describe("Nota o consejo adicional sobre el plan (opcional)"),
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

  const systemPrompt = `Eres un nutricionista experto que diseña planes de comidas personalizados.
Crea un plan de comidas práctico, sabroso y realista para el resto del día.

Reglas:
- Distribuye los macros restantes de forma equilibrada entre las comidas pendientes
- Los alimentos deben ser comunes y fáciles de conseguir (no ingredientes exóticos)
- Las porciones deben ser realistas y saciantes
- Los totales de cada comida DEBEN ser la suma exacta de sus alimentos
- Responde siempre en español
- Prefiere alimentos naturales y no procesados cuando sea posible`;

  const userPrompt = `Diseña un plan de comidas para las comidas pendientes del día: ${pendingLabel}.

Macros restantes para distribuir:
- Calorías: ${remainingCalories} kcal
- Proteína: ${remainingProtein}g
- Carbohidratos: ${remainingCarbs}g
- Grasa: ${remainingFat}g

Genera exactamente las comidas que faltan y distribuye los macros de forma inteligente.`;

  const { output, usage } = await generateText({
    model,
    output: Output.object({ schema: MealPlanSchema }),
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  return {
    meals: output.meals,
    notes: output.notes,
    model_used: modelName,
    usage: {
      prompt_tokens: (usage as any)?.promptTokens ?? (usage as any)?.prompt_tokens,
      completion_tokens: (usage as any)?.completionTokens ?? (usage as any)?.completion_tokens,
      total_tokens: (usage as any)?.totalTokens ?? (usage as any)?.total_tokens,
    },
  };
}
