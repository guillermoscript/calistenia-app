import { z } from "zod";
import type { Tier } from "./model-resolver.js";
import { RecipeSchema, HowManyMealsSchema } from "./schemas.js";
import { runStructuredGeneration } from "./structured-generation.js";

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
  confidence?: string | null;
}

export interface PantryPlanGoals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/**
 * Qué representa `goals`: el objetivo del día completo, o lo que le queda al
 * usuario hoy después de lo ya registrado. Sin esta distinción el mismo campo
 * significaba dos cosas según quién llamara, y planificar "hoy" a media tarde
 * devolvía un día entero encima de lo ya comido.
 */
export type BudgetKind = "full" | "remaining";

export interface PantryPlanInput {
  horizon: PantryPlanHorizon;
  pantryItems: PantrySnapshotItem[];
  goals: PantryPlanGoals | null;
  targetDate: string | null;
  budgetKind?: BudgetKind;
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
    const conf = it.confidence === "low" ? " (dato viejo: puede que ya no esté)" : "";
    return `- ${it.name} [${it.category}]: ${qty}${exp}${conf}`;
  });
  return `Hoy es ${today}. Inventario actual de la despensa:\n${lines.join("\n")}`;
}

function goalsBlock(goals: PantryPlanGoals | null, budgetKind: BudgetKind): string {
  if (!goals) return "El usuario no tiene metas de macros configuradas: apunta a comidas balanceadas.";
  const macros = `${goals.calories} kcal, ${goals.protein}g proteína, ${goals.carbs}g carbohidratos, ${goals.fat}g grasa`;
  if (budgetKind === "remaining") {
    return `Al usuario le QUEDAN hoy ${macros} (ya comió el resto de su meta diaria).
El plan completo debe sumar ESE presupuesto restante, no un día entero.`;
  }
  return `Metas diarias del usuario: ${macros}.`;
}

export async function generatePantryPlan({
  horizon,
  pantryItems,
  goals,
  targetDate,
  budgetKind = "full",
  tier,
}: PantryPlanInput) {
  const modeLine =
    horizon === "day"
      ? `Genera el plan de comidas de UN día (${targetDate ?? "mañana"}): desayuno, almuerzo, cena y snack, cada uno con receta completa.`
      : horizon === "week"
        ? `Genera el plan de comidas de la SEMANA completa (7 días desde ${targetDate ?? "el lunes de esta semana"}), day_index 0=lunes...6=domingo, cada comida con receta completa.`
        : `Modo "¿cuántas comidas me alcanzan?": NO generes plan; estima cuántas comidas completas salen del inventario, desglose por tipo de comida y qué ingrediente limita cada una.`;

  const prompt = `${inventoryBlock(pantryItems)}\n\n${goalsBlock(goals, budgetKind)}\n\n${modeLine}`;

  const { object, modelName, usage } = await runStructuredGeneration({
    promptName: "pantry-plan-generator",
    tier,
    schema: SCHEMA_BY_HORIZON[horizon],
    user: prompt,
    metadata: { horizon },
  });

  return {
    ...(object as Record<string, unknown>),
    model_used: modelName,
    usage,
  };
}
