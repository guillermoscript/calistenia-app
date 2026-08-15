/**
 * Output schema of `cal_gap_analysis` — the props the `gap-analysis` View
 * renders. Single source of truth: the tool declares it as `outputSchema`
 * (validated by the SDK at runtime) and the View imports the inferred
 * `Props` type.
 */
import { z } from "zod";

export const gapAnalysisPropsSchema = z.object({
  weeks: z.number(),
  scheduled: z.number(),
  completed: z.number(),
  completion_pct: z.number(),
  day_completion: z.array(
    z.object({
      day_id: z.string(),
      day_name: z.string(),
      day_focus: z.string(),
      expected: z.number(),
      actual: z.number(),
      completion_pct: z.number(),
      missed: z.number(),
    })
  ),
  neglected_exercises: z.array(z.object({ id: z.string(), name: z.string() })),
  muscle_volume: z.array(z.object({ muscle: z.string(), total_sets: z.number() })),
  // True when the current phase has no scheduled days (e.g. phase/program
  // mismatch) — `scheduled` is 0 in that case and completion_pct is
  // meaningless, so the widget shows a dedicated neutral state instead of
  // "N sesiones de 0 esperadas · 0% · bajando".
  no_schedule: z.boolean().optional(),
});

export type GapAnalysisProps = z.infer<typeof gapAnalysisPropsSchema>;
