/**
 * Output schema of `cal_readiness_check` — the props the `readiness-check`
 * View renders. Single source of truth: the tool declares it as
 * `outputSchema` (validated by the SDK at runtime) and the View imports the
 * inferred `Props` type.
 */
import { z } from "zod";

export const readinessCheckPropsSchema = z.object({
  score: z.number(),
  label: z.string(),
  factors: z.array(z.string()),
  recommendations: z.array(z.string()),
  sessions_this_week: z.number(),
  weekly_goal: z.number(),
  already_trained_today: z.boolean(),
  days_since_last_workout: z.number().nullable(),
});

export type ReadinessCheckProps = z.infer<typeof readinessCheckPropsSchema>;
