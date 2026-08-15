/**
 * Output schema of `cal_get_trends` — the props the `trends-chart` View
 * renders. Single source of truth: the tool declares it as `outputSchema`
 * (validated by the SDK at runtime) and the View imports the inferred
 * `Props` type.
 */
import { z } from "zod";

export const trendsChartPropsSchema = z.object({
  period_days: z.number(),
  weight: z.object({
    points: z.array(z.object({ date: z.string(), kg: z.number() })),
    first: z.number().nullable(),
    last: z.number().nullable(),
    delta: z.number().nullable(),
    min: z.number(),
    max: z.number(),
  }),
  weekly: z.array(z.object({ label: z.string(), sets: z.number(), sessions: z.number() })),
  totals: z.object({ sets: z.number(), sessions: z.number() }),
});

export type TrendsChartProps = z.infer<typeof trendsChartPropsSchema>;
