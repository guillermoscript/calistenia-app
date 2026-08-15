import { z } from "zod";

export const nutritionSummaryPropsSchema = z.object({
  from: z.string(),
  to: z.string(),
  days_logged: z.number(),
  total_entries: z.number(),
  adherence_pct: z.number().nullable(),
  daily_avg: z.object({
    calories: z.number(),
    protein: z.number(),
    carbs: z.number(),
    fat: z.number(),
  }),
  goals: z
    .object({
      calories: z.number(),
      protein: z.number(),
      carbs: z.number(),
      fat: z.number(),
    })
    .nullable(),
  most_logged_meals: z.array(z.object({ name: z.string(), count: z.number() })),
});

export type NutritionSummaryProps = z.infer<typeof nutritionSummaryPropsSchema>;
