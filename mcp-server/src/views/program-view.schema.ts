/**
 * Output schema of `cal_build_program` — the props the `program-view` View
 * renders.
 */
import { z } from "zod";

const exerciseSchema = z.object({
  name: z.string(),
  sets: z.number(),
  reps: z.string(),
  rest_seconds: z.number(),
  muscles: z.string().optional(),
});
const daySchema = z.object({
  day_name: z.string(),
  day_focus: z.string().optional(),
  exercises: z.array(exerciseSchema),
});
const phaseSchema = z.object({ name: z.string(), days: z.array(daySchema) });

export const programViewPropsSchema = z.object({
  id: z.string(),
  name: z.string(),
  difficulty: z.string().optional(),
  duration_weeks: z.number().optional(),
  is_current: z.boolean(),
  phases_count: z.number(),
  total_exercises: z.number(),
  phases: z.array(phaseSchema),
});

export type ProgramViewProps = z.infer<typeof programViewPropsSchema>;
