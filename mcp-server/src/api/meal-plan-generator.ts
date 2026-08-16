import { z } from "zod";
import type { Tier } from "./model-resolver.js";
import { compilePrompt } from "./prompts.js";
import { RecipeSchema } from "./schemas.js";
import type { PantrySnapshotItem } from "./pantry-plan-generator.js";
import { runStructuredGeneration } from "./structured-generation.js";

// ⚠️ OpenAI strict mode: SIEMPRE .nullable(), NUNCA .optional()
const PlannedMealSchema = z.object({
  meal_type: z.enum(["desayuno", "almuerzo", "cena", "snack"]),
  label: z.string().describe("Nombre corto de la comida"),
  description: z.string().describe("Alimentos con porciones, ej: 'Pechuga 150g, arroz 200g, ensalada'"),
  calories: z.number().describe("Calorías totales (kcal)"),
  protein: z.number().describe("Proteína total (g)"),
  carbs: z.number().describe("Carbohidratos totales (g)"),
  fat: z.number().describe("Grasa total (g)"),
  // Sin esto la lista de compras no puede saber qué falta: era el motivo de que
  // "planificar comprando" no existiera como función (solo los planes de
  // despensa devolvían ingredientes).
  recipe: RecipeSchema.nullable().describe(
    "Receta con ingredientes etiquetados from:'pantry' (el usuario ya lo tiene) o 'buy' (hay que comprarlo). Null solo si la comida no requiere preparación alguna."
  ),
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
  /** Inventario SOLO para etiquetar from:'pantry'|'buy'. NO restringe el plan. */
  pantryItems?: PantrySnapshotItem[];
  tier: Tier;
}

interface WeeklyMealPlanInput {
  dailyCalories: number;
  dailyProtein: number;
  dailyCarbs: number;
  dailyFat: number;
  goal: string;
  /** Inventario SOLO para etiquetar from:'pantry'|'buy'. NO restringe el plan. */
  pantryItems?: PantrySnapshotItem[];
  tier: Tier;
}

const MEAL_ORDER = ["desayuno", "almuerzo", "cena", "snack"];

/**
 * Bloque de inventario para el plan LIBRE. Diferencia clave con el generador de
 * despensa: allá el inventario es una restricción ("cocina solo con esto"), acá
 * es solo un diccionario para marcar cada ingrediente como ya-lo-tengo o
 * hay-que-comprarlo. Sin inventario todo se etiqueta 'buy'.
 */
function taggingBlock(items: PantrySnapshotItem[] | undefined): string {
  if (!items || items.length === 0) {
    return `El usuario no tiene inventario registrado: etiqueta TODOS los ingredientes con from:"buy".`;
  }
  const lines = items.map((it) => {
    const qty = it.quantity != null ? `${it.quantity} ${it.unit ?? ""}`.trim() : "cantidad desconocida";
    return `- ${it.name} [${it.category}]: ${qty}`;
  });
  return `El usuario YA TIENE en casa (esto NO limita el plan, es solo para etiquetar):
${lines.join("\n")}

Regla: un ingrediente lleva from:"pantry" solo si aparece arriba en cantidad suficiente; en cualquier otro caso lleva from:"buy".`;
}

/**
 * Variables del mensaje `user` del plan diario (#298, fase 2). Los condicionales
 * (`taggingBlock`) se quedan en TypeScript y entran como UNA variable ya
 * redactada; Langfuse manda sobre el texto que las rodea.
 *
 * Exportado solo para que `prompts.test.ts` pueda probar que el compilado es
 * idéntico, byte a byte, al string que producía el código antes de migrar.
 */
export function dailyMealPlanVars({
  remainingCalories,
  remainingProtein,
  remainingCarbs,
  remainingFat,
  loggedMealTypes,
  pantryItems,
}: Omit<MealPlanInput, "tier">): Record<string, string> {
  const pendingMeals = MEAL_ORDER.filter((m) => !loggedMealTypes.includes(m));
  return {
    pendingLabel:
      pendingMeals.length > 0 ? pendingMeals.join(", ") : "snack o comida adicional",
    macros: `${remainingCalories}kcal, ${remainingProtein}g prot, ${remainingCarbs}g carbs, ${remainingFat}g grasa`,
    pantryTagging: taggingBlock(pantryItems),
  };
}

export async function generateDailyMealPlan({
  remainingCalories,
  remainingProtein,
  remainingCarbs,
  remainingFat,
  loggedMealTypes,
  pantryItems,
  tier,
}: MealPlanInput) {
  const { prompt, usedFallback } = await compilePrompt(
    "meal-plan-generator-user",
    dailyMealPlanVars({
      remainingCalories,
      remainingProtein,
      remainingCarbs,
      remainingFat,
      loggedMealTypes,
      pantryItems,
    })
  );

  const { object, modelName, usage } = await runStructuredGeneration({
    promptName: "meal-plan-generator",
    tier,
    schema: MealPlanSchema,
    user: prompt,
    // `userPromptFallback` deja el fallo del guard visible en la traza, que es
    // donde este tipo de fallo se mira. El AI API no tiene Sentry hoy.
    metadata: { userPromptFallback: usedFallback },
  });

  return {
    meals: object.meals,
    notes: object.notes,
    model_used: modelName,
    usage,
  };
}

export async function generateWeeklyMealPlan({
  dailyCalories,
  dailyProtein,
  dailyCarbs,
  dailyFat,
  goal,
  pantryItems,
  tier,
}: WeeklyMealPlanInput) {
  const prompt = `Diseña un plan semanal (lunes a domingo) para una persona con objetivo: ${goal}.
Macros diarios objetivo: ${dailyCalories}kcal, ${dailyProtein}g prot, ${dailyCarbs}g carbs, ${dailyFat}g grasa.
Cada día debe tener 4 comidas (desayuno, almuerzo, cena, snack) que sumen los macros objetivo.
Asegura máxima variedad entre días. Usa alimentos comunes, porciones realistas, en español.

${taggingBlock(pantryItems)}

Cada comida debe traer su receta con la lista completa de ingredientes y su etiqueta from.`;

  const { object, modelName, usage } = await runStructuredGeneration({
    promptName: "weekly-meal-plan-generator",
    tier,
    schema: WeeklyMealPlanSchema,
    user: prompt,
  });

  return {
    days: object.days,
    model_used: modelName,
    usage,
  };
}
