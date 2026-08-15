import { z } from "zod";

const foodSchema = z.object({
  name: z.string(),
  portion: z.string(),
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
});

export const nutritionLogResultPropsSchema = z.object({
  entry_id: z.string(),
  meal_type: z.enum(["desayuno", "almuerzo", "cena", "snack"]),
  foods: z.array(foodSchema),
  totals: z.object({ calories: z.number(), protein: z.number(), carbs: z.number(), fat: z.number() }),
  today_totals: z.object({ calories: z.number(), protein: z.number(), carbs: z.number(), fat: z.number() }).optional(),
  goals: z.object({ calories: z.number(), protein: z.number(), carbs: z.number(), fat: z.number() }).nullable().optional(),
});

export type NutritionLogResultProps = z.infer<typeof nutritionLogResultPropsSchema>;
