/**
 * repos/programs.ts — programs, phases, exercises and the user's current
 * program (#480). Replaces the "current program with `expand: program`" read
 * (5 sites), the "deactivate current + create" preamble (3 sites) and the
 * per-program phase/exercise listings.
 */

import type { PB, RecordModel } from "./pb.js";

export interface CurrentProgram {
  /** The `user_programs` row (with `expand.program`). */
  userProgram: RecordModel;
  /** The expanded `programs` record. */
  program: RecordModel;
}

/**
 * The user's current program (`is_current = true`) with the program expanded,
 * or null when none is set / the expand is missing. Callers used to unwrap
 * `userPrograms[0].expand?.program` themselves at every site.
 */
export async function getCurrentProgram(pb: PB, userId: string): Promise<CurrentProgram | null> {
  const rows = await pb.collection("user_programs").getFullList({
    filter: pb.filter("user = {:userId} && is_current = true", { userId }),
    expand: "program",
    requestKey: null,
  });
  const userProgram = rows[0];
  const program = userProgram?.expand?.program as RecordModel | undefined;
  if (!userProgram || !program) return null;
  return { userProgram, program };
}

/**
 * Make `programId` the user's current program: deactivate every current row,
 * then reactivate the user's existing row for that program (if any) or create
 * one. Returns the active `user_programs` record.
 *
 * Reusing the existing row (instead of always creating) is what the
 * cal_set_current_program tool already did; the "create + set current" flows
 * always created, which could leave duplicate rows for the same program.
 */
export async function setCurrentProgram(pb: PB, userId: string, programId: string): Promise<RecordModel> {
  const current = await pb.collection("user_programs").getFullList({
    filter: pb.filter("user = {:userId} && is_current = true", { userId }),
    fields: "id,program,is_current",
    requestKey: null,
  });
  for (const up of current) {
    await pb.collection("user_programs").update(up.id, { is_current: false });
  }

  const existing = await pb
    .collection("user_programs")
    .getFirstListItem(pb.filter("user = {:userId} && program = {:programId}", { userId, programId }), {
      requestKey: null,
    })
    .catch(() => null);

  const startedAt = new Date().toISOString();
  if (existing) {
    return pb.collection("user_programs").update(existing.id, { is_current: true, started_at: startedAt });
  }
  return pb.collection("user_programs").create({ user: userId, program: programId, is_current: true, started_at: startedAt });
}

/** Phases of a program, in `sort_order`. */
export function listProgramPhases<T extends RecordModel = RecordModel>(pb: PB, programId: string): Promise<T[]> {
  return pb.collection("program_phases").getFullList<T>({
    filter: pb.filter("program = {:programId}", { programId }),
    sort: "sort_order",
    requestKey: null,
  });
}

export interface ProgramExercisesQuery {
  /** Restrict to one phase (`phase_number`). */
  phase?: number;
  /** Restrict to one day (`day_id`); only meaningful together with `phase`. */
  dayId?: string;
  /** Sort expression. Default: `phase_number,day_id,sort_order`. */
  sort?: string;
}

/** Exercises of a program, optionally narrowed to a phase / day. */
export function listProgramExercises<T extends RecordModel = RecordModel>(
  pb: PB,
  programId: string,
  q: ProgramExercisesQuery = {},
): Promise<T[]> {
  const parts = ["program = {:programId}"];
  const params: Record<string, unknown> = { programId };
  if (q.phase !== undefined) {
    parts.push("phase_number = {:phase}");
    params.phase = q.phase;
  }
  if (q.dayId !== undefined) {
    parts.push("day_id = {:dayId}");
    params.dayId = q.dayId;
  }
  return pb.collection("program_exercises").getFullList<T>({
    filter: pb.filter(parts.join(" && "), params),
    sort: q.sort ?? "phase_number,day_id,sort_order",
    requestKey: null,
  });
}
