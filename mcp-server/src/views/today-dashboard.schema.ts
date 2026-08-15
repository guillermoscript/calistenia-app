/**
 * Output schema of `cal_get_today_dashboard` — the props the
 * `today-dashboard` View renders. Single source of truth: the tool declares
 * it as `outputSchema` (validated by the SDK at runtime) and the View
 * imports the inferred `Props` type.
 */
import { z } from "zod";

const macroSchema = z.object({ consumed: z.number(), goal: z.number() });

export const todayDashboardPropsSchema = z.object({
  readiness: z.object({ score: z.number(), label: z.string(), factors: z.array(z.string()) }),
  workout: z.object({
    has_workout: z.boolean(),
    day_name: z.string(),
    day_focus: z.string(),
    program_name: z.string(),
    exercises: z.array(z.object({ name: z.string(), sets: z.number(), reps: z.string(), rest: z.number() })),
    week_progress: z.object({ completed: z.number(), total: z.number() }),
    workout_key: z.string(),
  }).nullable(),
  nutrition: z.object({
    calories: macroSchema,
    protein: macroSchema,
    carbs: macroSchema,
    fat: macroSchema,
    meals_logged: z.number(),
  }),
  streak: z.number(),
});

export type TodayDashboardProps = z.infer<typeof todayDashboardPropsSchema>;
