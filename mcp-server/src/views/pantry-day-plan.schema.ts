import { z } from "zod";

const ingredientSchema = z.object({
  name: z.string(),
  name_normalized: z.string(),
  qty: z.number().nullable(),
  unit: z.string().nullable(),
  from: z.enum(["pantry", "buy"]),
});

const recipeSchema = z.object({
  steps: z.array(z.string()),
  ingredients: z.array(ingredientSchema),
  prep_minutes: z.number().nullable(),
  servings: z.number().nullable(),
  photo_query: z.string().nullable(),
});

const mealSchema = z.object({
  meal_type: z.enum(["desayuno", "almuerzo", "cena", "snack"]),
  label: z.string(),
  description: z.string(),
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  recipe: recipeSchema.nullable(),
});

export const pantryDayPlanPropsSchema = z.object({
  target_date: z.string().nullable(),
  meals: z.array(mealSchema),
  notes: z.string(),
});

export type PantryDayPlanProps = z.infer<typeof pantryDayPlanPropsSchema>;
