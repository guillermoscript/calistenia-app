/**
 * Output schema of `cal_todays_workout` — the props the `session-tracker`
 * View renders. Single source of truth: the tool declares it as
 * `outputSchema` (validated by the SDK at runtime) and the View imports the
 * inferred `Props` type.
 */
import { z } from "zod";

const exerciseSchema = z.object({
  // Catalog id of the exercise (program_exercises.exercise_id) — what
  // cal_log_full_workout wants back; may be missing for legacy rows.
  exercise_id: z.string().optional(),
  name: z.string(),
  sets: z.number(),
  reps: z.string(),
  rest: z.number(),
  muscles: z.string().optional(),
});

export const sessionTrackerPropsSchema = z.object({
  // All-complete variant: every workout day this week is already logged.
  // There's no "next" day to track, so most fields below are irrelevant —
  // the View renders a dedicated rest-day state instead of a broken
  // exercise tracker. See src/tools/smart.ts cal_todays_workout.
  all_complete: z.boolean().optional(),
  day_id: z.string().optional(),
  day_name: z.string().optional(),
  day_focus: z.string().optional(),
  phase: z.number().optional(),
  program_name: z.string().optional(),
  workout_key: z.string().optional(),
  exercises: z.array(exerciseSchema).optional(),
  week_progress: z.object({ completed: z.number(), total: z.number() }),
});

export type SessionTrackerProps = z.infer<typeof sessionTrackerPropsSchema>;
