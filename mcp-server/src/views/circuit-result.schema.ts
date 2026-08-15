/**
 * Output schema of `cal_get_circuit_session` — the props the `circuit-result`
 * View renders.
 */
import { z } from "zod";

const exerciseSchema = z.object({
  // Slug stored on the session's exercises JSON (see cal_log_circuit_session);
  // legacy rows may lack it. Declared because the tool passes it through and
  // hosts validate `structuredContent` against this schema with
  // additionalProperties: false.
  exerciseId: z.string().nullable().optional(),
  name: z.string(),
  reps: z.string().nullable(),
});

const configSchema = z.object({
  work_seconds: z.number().nullable(),
  rest_seconds: z.number().nullable(),
  rest_between_exercises: z.number().nullable(),
  rest_between_rounds: z.number().nullable(),
}).nullable();

export const circuitResultPropsSchema = z.object({
  circuit_name: z.string(),
  mode: z.enum(["circuit", "timed"]),
  rounds_completed: z.number(),
  rounds_target: z.number(),
  duration_seconds: z.number(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  note: z.string().nullable(),
  exercises: z.array(exerciseSchema),
  config: configSchema,
});

export type CircuitResultProps = z.infer<typeof circuitResultPropsSchema>;
