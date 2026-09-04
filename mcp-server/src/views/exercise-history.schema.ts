/**
 * Output schema of `cal_get_exercise_history` — the props the
 * `exercise-history` View renders.
 */
import { z } from "zod";

const setSchema = z.object({
  reps: z.string(),
  note: z.string().optional(),
});

export const exerciseHistoryPropsSchema = z.object({
  exercise_id: z.string(),
  exercise_name: z.string().optional(),
  /** Every raw `exercise_id` merged into this history (#702); absent when nothing merged. */
  exercise_ids: z.array(z.string()).optional(),
  days: z.number(),
  total_sets: z.number(),
  sessions: z.array(
    z.object({
      date: z.string(),
      sets: z.array(setSchema),
    })
  ),
});

export type ExerciseHistoryProps = z.infer<typeof exerciseHistoryPropsSchema>;
