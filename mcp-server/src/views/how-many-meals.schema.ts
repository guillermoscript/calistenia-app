import { z } from "zod";

export const howManyMealsPropsSchema = z.object({
  total_meals: z.number(),
  days_covered: z.number(),
  breakdown: z.array(
    z.object({
      meal_label: z.string(),
      times_possible: z.number(),
      limiting_ingredient: z.string(),
    })
  ),
  summary: z.string(),
});

export type HowManyMealsProps = z.infer<typeof howManyMealsPropsSchema>;
